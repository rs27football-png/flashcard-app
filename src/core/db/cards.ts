import type { Asset, Card, CardProgress } from '../types'
import type { CompressedImage } from '../media/compress'
import { buildCardNormalized } from '../search/normalize'
import { db, newId, nextOrder } from './db'

/**
 * 画像欄の編集内容 (specs.md §4.4.2).
 *
 * 画像は保存を押した時点で初めて書き込む. 添付しただけで書いてしまうと,
 * 編集をやめたときに参照されない画像が残るためである.
 */
export type ImageEdit =
  /** 触っていない */
  | { kind: 'keep' }
  /** 外す */
  | { kind: 'remove' }
  /** 新しく付ける, または差し替える */
  | { kind: 'set'; image: CompressedImage }

/** カード編集画面から受け取る入力 */
export interface CardInput {
  term: string
  definition: string
  hint: string
  /** 表面の画像. 省略は「触っていない」と同じ */
  termImage?: ImageEdit
  /** 裏面の画像 */
  definitionImage?: ImageEdit
}

/** 表示順で整列したカードを返す. order が同値のときは作成順で安定させる */
export async function listCards(setId: string): Promise<Card[]> {
  const cards = await db.cards.where('setId').equals(setId).toArray()
  return cards.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export function getCard(id: string): Promise<Card | undefined> {
  return db.cards.get(id)
}

function trimInput(input: CardInput): CardInput {
  return {
    ...input,
    term: input.term.trim(),
    definition: input.definition.trim(),
    hint: input.hint.trim(),
  }
}

/** その面に画像が残るか. 保存後の状態で判定する */
function hasImage(edit: ImageEdit | undefined, current: string | null): boolean {
  if (edit === undefined || edit.kind === 'keep') return current !== null
  return edit.kind === 'set'
}

/**
 * 用語と定義がともに空のカードは作れない.
 * ただし画像のみのカードを許容するため, 画像が付く面の空文字列は認める (specs.md §2.3).
 */
function assertNotEmpty(input: CardInput, card: Pick<Card, 'termImageId' | 'definitionImageId'>): void {
  const front = input.term !== '' || hasImage(input.termImage, card.termImageId)
  const back = input.definition !== '' || hasImage(input.definitionImage, card.definitionImageId)
  if (!front && !back) {
    throw new Error('用語と定義の少なくとも一方を入力してください。')
  }
}

/**
 * 画像欄の編集を書き込み, 保存後の画像 ID を返す.
 * 呼び出し側のトランザクションの中で使う.
 *
 * 差し替えと取り外しでは古い実体を消す. カードから外れた画像は誰からも参照されず,
 * 残しておくと容量だけを食うためである.
 */
async function applyImageEdit(
  edit: ImageEdit | undefined,
  current: string | null,
  setId: string,
  now: number,
): Promise<string | null> {
  if (edit === undefined || edit.kind === 'keep') return current
  if (current !== null) await db.assets.delete(current)
  if (edit.kind === 'remove') return null

  const asset: Asset = {
    id: newId(),
    setId,
    blob: edit.image.blob,
    mimeType: edit.image.mimeType,
    width: edit.image.width,
    height: edit.image.height,
    bytes: edit.image.bytes,
    createdAt: now,
  }
  await db.assets.add(asset)
  return asset.id
}

/** カードを追加する. 進捗レコードを同時に生成する (specs.md §2.5) */
export async function createCard(setId: string, input: CardInput): Promise<Card> {
  const values = trimInput(input)
  assertNotEmpty(values, { termImageId: null, definitionImageId: null })

  const now = Date.now()
  return db.transaction('rw', db.cards, db.progress, db.assets, db.sets, async () => {
    const card: Card = {
      id: newId(),
      setId,
      term: values.term,
      definition: values.definition,
      hint: values.hint,
      termImageId: await applyImageEdit(values.termImage, null, setId, now),
      definitionImageId: await applyImageEdit(values.definitionImage, null, setId, now),
      starred: false,
      order: nextOrder(await db.cards.where('setId').equals(setId).toArray()),
      normalized: buildCardNormalized(values),
      createdAt: now,
      updatedAt: now,
    }
    const progress: CardProgress = {
      cardId: card.id,
      setId,
      status: 'unseen',
      lastAnsweredAt: null,
      quizCorrect: 0,
      quizWrong: 0,
    }
    await db.cards.add(card)
    await db.progress.add(progress)
    await db.sets.update(setId, { updatedAt: now })
    return card
  })
}

/** カードの内容を更新する. 検索用文字列も同時に作り直す */
export async function updateCard(id: string, input: CardInput): Promise<void> {
  const values = trimInput(input)

  const now = Date.now()
  await db.transaction('rw', db.cards, db.assets, db.sets, async () => {
    const card = await db.cards.get(id)
    if (!card) return
    assertNotEmpty(values, card)
    await db.cards.update(id, {
      term: values.term,
      definition: values.definition,
      hint: values.hint,
      termImageId: await applyImageEdit(values.termImage, card.termImageId, card.setId, now),
      definitionImageId: await applyImageEdit(
        values.definitionImage,
        card.definitionImageId,
        card.setId,
        now,
      ),
      normalized: buildCardNormalized(values),
      updatedAt: now,
    })
    await db.sets.update(card.setId, { updatedAt: now })
  })
}

/** カードを削除する. 進捗と画像も連動して削除する (specs.md §4.3) */
export async function deleteCard(id: string): Promise<void> {
  await db.transaction('rw', db.cards, db.progress, db.assets, db.sets, async () => {
    const card = await db.cards.get(id)
    if (!card) return
    const assetIds = [card.termImageId, card.definitionImageId].filter(
      (assetId): assetId is string => assetId !== null,
    )
    await db.cards.delete(id)
    await db.progress.delete(id)
    if (assetIds.length > 0) await db.assets.bulkDelete(assetIds)
    await db.sets.update(card.setId, { updatedAt: Date.now() })
  })
}

/** セット配下のカード・進捗・画像をまとめて削除する. セット削除とフォルダ削除から呼ぶ */
export async function deleteCardsOfSet(setId: string): Promise<void> {
  await db.transaction('rw', db.cards, db.progress, db.assets, async () => {
    await db.cards.where('setId').equals(setId).delete()
    await db.progress.where('setId').equals(setId).delete()
    await db.assets.where('setId').equals(setId).delete()
  })
}

export async function setStarred(id: string, starred: boolean): Promise<void> {
  await db.cards.update(id, { starred, updatedAt: Date.now() })
}

/**
 * カードの並びをまとめて指定する。ドラッグでの並べ替えに用いる (specs.md §4.3)。
 *
 * 渡された順に order を振り直す。指定から漏れたカードは末尾へ回し、
 * 並べ替えの最中にカードが増えていても取りこぼさないようにする。
 */
export async function reorderCards(setId: string, cardIds: readonly string[]): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const cards = await listCards(setId)
    const byId = new Map(cards.map((card) => [card.id, card]))
    const wanted = new Set(cardIds)
    const ordered = cardIds
      .map((id) => byId.get(id))
      .filter((card): card is Card => card !== undefined)
    const rest = cards.filter((card) => !wanted.has(card.id))
    await db.cards.bulkPut([...ordered, ...rest].map((card, index) => ({ ...card, order: index })))
  })
}

/** 「用語の昇順」「作成日時順」への一括整列 (specs.md §4.3) */
export async function sortCards(setId: string, by: 'term' | 'createdAt'): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const cards = await listCards(setId)
    const sorted = [...cards].sort((a, b) =>
      by === 'term'
        ? // 数字混じりの用語を人が期待する順に並べるため localeCompare の numeric を用いる
          a.term.localeCompare(b.term, 'ja', { numeric: true })
        : a.createdAt - b.createdAt,
    )
    await db.cards.bulkPut(sorted.map((card, index) => ({ ...card, order: index })))
  })
}

/**
 * カードをまとめて追加する. テキストインポートから呼ぶ (specs.md §4.5).
 *
 * 1枚ずつ createCard を呼ぶと, 枚数分だけトランザクションと order の再計算が走る.
 * 数百枚の貼り付けが前提のため, 一括の書き込みにまとめる.
 *
 * @returns 実際に追加した枚数
 */
export async function createCards(
  setId: string,
  inputs: readonly CardInput[],
): Promise<number> {
  const values = inputs
    .map(trimInput)
    .filter((input) => input.term !== '' || input.definition !== '')
  if (values.length === 0) return 0

  const now = Date.now()
  const base = nextOrder(await db.cards.where('setId').equals(setId).toArray())
  const cards: Card[] = values.map((input, index) => ({
    id: newId(),
    setId,
    ...input,
    termImageId: null,
    definitionImageId: null,
    starred: false,
    order: base + index,
    normalized: buildCardNormalized(input),
    createdAt: now,
    updatedAt: now,
  }))
  const progress: CardProgress[] = cards.map((card) => ({
    cardId: card.id,
    setId,
    status: 'unseen',
    lastAnsweredAt: null,
    quizCorrect: 0,
    quizWrong: 0,
  }))

  await db.transaction('rw', db.cards, db.progress, db.sets, async () => {
    await db.cards.bulkAdd(cards)
    await db.progress.bulkAdd(progress)
    await db.sets.update(setId, { updatedAt: now })
  })
  return cards.length
}

/**
 * 全カードを読み出す. 横断検索は画面を開いている間これを手元に持ち,
 * 入力のたびに IndexedDB を読み直さずに照合する (specs.md §6.3).
 */
export function listAllCards(): Promise<Card[]> {
  return db.cards.toArray()
}
