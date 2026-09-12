import type { Card, CardProgress } from '../types'
import { buildCardNormalized } from '../search/normalize'
import { db, newId, nextOrder } from './db'

/** カード編集画面から受け取る入力 (段階1 では画像を扱わない) */
export interface CardInput {
  term: string
  definition: string
  hint: string
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
    term: input.term.trim(),
    definition: input.definition.trim(),
    hint: input.hint.trim(),
  }
}

/**
 * 用語と定義がともに空のカードは作れない.
 * 段階6 で画像に対応した後は, 画像が添付されていれば空文字列を認める (specs.md §2.3).
 */
function assertNotEmpty(input: CardInput): void {
  if (input.term === '' && input.definition === '') {
    throw new Error('用語と定義の少なくとも一方を入力してください.')
  }
}

/** カードを追加する. 進捗レコードを同時に生成する (specs.md §2.5) */
export async function createCard(setId: string, input: CardInput): Promise<Card> {
  const values = trimInput(input)
  assertNotEmpty(values)

  const now = Date.now()
  const card: Card = {
    id: newId(),
    setId,
    ...values,
    termImageId: null,
    definitionImageId: null,
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

  await db.transaction('rw', db.cards, db.progress, db.sets, async () => {
    await db.cards.add(card)
    await db.progress.add(progress)
    await db.sets.update(setId, { updatedAt: now })
  })
  return card
}

/** カードの内容を更新する. 検索用文字列も同時に作り直す */
export async function updateCard(id: string, input: CardInput): Promise<void> {
  const values = trimInput(input)
  assertNotEmpty(values)

  const now = Date.now()
  await db.transaction('rw', db.cards, db.sets, async () => {
    const card = await db.cards.get(id)
    if (!card) return
    await db.cards.update(id, {
      ...values,
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
 * カードを1つ隣と入れ替える (direction: -1 で上, 1 で下).
 *
 * 全件の order を振り直すのではなく2件の order を交換するだけにしてある.
 * カードが1万枚あるセットでも書き込みが2件で済むようにするため.
 */
export async function moveCard(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(id)
    if (!card) return
    const cards = await listCards(card.setId)
    const index = cards.findIndex((item) => item.id === id)
    const target = cards[index + direction]
    if (!target) return // 端にいるので何もしない
    await db.cards.update(card.id, { order: target.order })
    await db.cards.update(target.id, { order: card.order })
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
