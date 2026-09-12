// 学習セットのコピー・統合・分割 (specs.md §4.9).
import type { Asset, Card, CardProgress, Folder, StudySet } from '../types'
import { listCards } from './cards'
import { db, newId, nextOrder } from './db'
import { collectSubtreeIds, listChildFolders } from './folders'
import { deleteSet, listSetsInFolder } from './sets'

/** これらの操作が触るテーブル. 途中で失敗したときに半端な状態を残さないよう1つのトランザクションにまとめる */
const SCOPE = [db.sets, db.cards, db.progress, db.assets, db.sessions]

/** 用語と定義の組を一意に表す鍵. 重複の判定に用いる */
const duplicateKey = (card: Pick<Card, 'term' | 'definition'>) => `${card.term}\n${card.definition}`

interface CloneOptions {
  targetSetId: string
  /** 複製先での並び順の開始値 */
  startOrder: number
  /** 進捗を引き継ぐか. false なら未学習から始める */
  keepProgress: boolean
  now: number
}

/**
 * カードを別のセットへ複製する. 呼び出し側のトランザクションの中で使う.
 *
 * 画像は参照を共有させず, 実体ごと複製する. 共有すると片方のセットを消したときに
 * もう片方の画像まで消えてしまうため (画像はセットの削除に連動して消える, §4.2).
 */
async function cloneCards(cards: readonly Card[], options: CloneOptions): Promise<number> {
  if (cards.length === 0) return 0

  const progress = await db.progress.bulkGet(cards.map((card) => card.id))
  const assetIds = cards
    .flatMap((card) => [card.termImageId, card.definitionImageId])
    .filter((assetId): assetId is string => assetId !== null)
  const assets = assetIds.length > 0 ? await db.assets.bulkGet(assetIds) : []

  const assetIdMap = new Map<string, string>()
  const newAssets: Asset[] = []
  for (const asset of assets) {
    if (asset === undefined || assetIdMap.has(asset.id)) continue
    const id = newId()
    assetIdMap.set(asset.id, id)
    newAssets.push({ ...asset, id, setId: options.targetSetId, createdAt: options.now })
  }
  const mapAsset = (assetId: string | null) =>
    assetId === null ? null : (assetIdMap.get(assetId) ?? null)

  const newCards: Card[] = []
  const newProgress: CardProgress[] = []
  cards.forEach((card, index) => {
    const id = newId()
    newCards.push({
      ...card,
      id,
      setId: options.targetSetId,
      order: options.startOrder + index,
      termImageId: mapAsset(card.termImageId),
      definitionImageId: mapAsset(card.definitionImageId),
      createdAt: options.now,
      updatedAt: options.now,
    })
    const source = progress[index]
    newProgress.push(
      options.keepProgress && source !== undefined
        ? { ...source, cardId: id, setId: options.targetSetId }
        : {
            cardId: id,
            setId: options.targetSetId,
            status: 'unseen',
            lastAnsweredAt: null,
            quizCorrect: 0,
            quizWrong: 0,
          },
    )
  })

  if (newAssets.length > 0) await db.assets.bulkAdd(newAssets)
  await db.cards.bulkAdd(newCards)
  await db.progress.bulkAdd(newProgress)
  return newCards.length
}

/** カードを進捗・画像ごと取り除く. 呼び出し側のトランザクションの中で使う */
async function removeCards(cards: readonly Card[]): Promise<void> {
  const ids = cards.map((card) => card.id)
  const assetIds = cards
    .flatMap((card) => [card.termImageId, card.definitionImageId])
    .filter((assetId): assetId is string => assetId !== null)
  await db.cards.bulkDelete(ids)
  await db.progress.bulkDelete(ids)
  if (assetIds.length > 0) await db.assets.bulkDelete(assetIds)
}

// ---------------- コピー (§4.9.1) ----------------

export interface CopySetOptions {
  name: string
  folderId: string | null
  /** 進捗を引き継ぐか. 既定では引き継がない */
  keepProgress: boolean
}

/** 学習セットを複製する. 作ったセットの ID を返す */
export async function copySet(setId: string, options: CopySetOptions): Promise<string> {
  return db.transaction('rw', SCOPE, async () => {
    const source = await db.sets.get(setId)
    if (source === undefined) throw new Error('コピー元のセットが見つかりません.')
    const now = Date.now()
    // ★ (カードの属性) とリッチコンテンツ設定, 学習オプションはそのまま引き継ぐ
    const copy: StudySet = {
      ...source,
      id: newId(),
      name: options.name.trim(),
      folderId: options.folderId,
      order: nextOrder(await listSetsInFolder(options.folderId)),
      createdAt: now,
      updatedAt: now,
    }
    await db.sets.add(copy)
    await cloneCards(await listCards(setId), {
      targetSetId: copy.id,
      startOrder: 0,
      keepProgress: options.keepProgress,
      now,
    })
    return copy.id
  })
}

// ---------------- 統合 (§4.9.2) ----------------

export type MergeDestination =
  | { kind: 'new'; name: string; folderId: string | null }
  | { kind: 'existing'; setId: string }

export interface MergeOptions {
  /** 統合するセット. この順にカードを並べる */
  sourceIds: readonly string[]
  destination: MergeDestination
  /** 用語と定義が完全一致するカードを除外する. 既定はオン */
  skipDuplicates: boolean
  /** 統合元のセットを削除する. 既定は残す */
  deleteSources: boolean
}

export interface MergeResult {
  setId: string
  added: number
  skipped: number
  deleted: number
}

/**
 * 学習セットを統合する.
 *
 * 既存のセットへ追記する場合, 追記先のカードは今の並びのまま先頭に残り,
 * 他の統合元が sourceIds の順に後ろへ続く. 追記先が統合元に含まれていても二重には取り込まない.
 * 取り込んだカードの進捗は未学習から始める (§4.9.2, §9.2 D3).
 */
export async function mergeSets(options: MergeOptions): Promise<MergeResult> {
  if (options.sourceIds.length < 2) throw new Error('統合するセットを2つ以上選んでください.')

  return db.transaction('rw', SCOPE, async () => {
    const now = Date.now()
    const found = await db.sets.bulkGet([...options.sourceIds])
    const sources = found.filter((set): set is StudySet => set !== undefined)
    if (sources.length !== options.sourceIds.length) {
      throw new Error('統合元のセットが見つかりません.')
    }

    let target: StudySet
    if (options.destination.kind === 'new') {
      const { name, folderId } = options.destination
      target = {
        ...sources[0],
        id: newId(),
        name: name.trim(),
        description: '',
        folderId,
        order: nextOrder(await listSetsInFolder(folderId)),
        createdAt: now,
        updatedAt: now,
      }
      await db.sets.add(target)
    } else {
      const existing = await db.sets.get(options.destination.setId)
      if (existing === undefined) throw new Error('統合先のセットが見つかりません.')
      target = existing
    }

    // リッチコンテンツ設定は統合元の論理和 (§4.4.4)
    const involved = [target, ...sources]
    await db.sets.update(target.id, {
      enableImages: involved.some((set) => set.enableImages),
      enableMath: involved.some((set) => set.enableMath),
      updatedAt: now,
    })

    const existingCards = await listCards(target.id)
    const seen = new Set(existingCards.map(duplicateKey))
    let order = nextOrder(existingCards)
    let added = 0
    let skipped = 0

    for (const sourceId of options.sourceIds) {
      if (sourceId === target.id) continue
      const cards = await listCards(sourceId)
      const picked = options.skipDuplicates
        ? cards.filter((card) => {
            const key = duplicateKey(card)
            if (seen.has(key)) {
              skipped += 1
              return false
            }
            seen.add(key)
            return true
          })
        : cards
      added += await cloneCards(picked, {
        targetSetId: target.id,
        startOrder: order,
        keepProgress: false,
        now,
      })
      order += picked.length
    }

    let deleted = 0
    if (options.deleteSources) {
      for (const sourceId of options.sourceIds) {
        if (sourceId === target.id) continue
        await deleteSet(sourceId)
        deleted += 1
      }
    }

    return { setId: target.id, added, skipped, deleted }
  })
}

// ---------------- 分割 (§4.9.3) ----------------

export type SplitRule =
  | { kind: 'count'; size: number }
  | { kind: 'starred' }
  | { kind: 'manual'; cardIds: readonly string[]; name: string }

export interface SplitGroup {
  name: string
  cards: Card[]
}

/**
 * 分割の結果を組み立てる. 書き込みはせず, 画面のプレビューと splitSet の双方で使う.
 * 生成されるセット名は仕様の表に従う.
 */
export function planSplit(setName: string, cards: readonly Card[], rule: SplitRule): SplitGroup[] {
  switch (rule.kind) {
    case 'count': {
      const size = Math.max(1, Math.floor(rule.size))
      const groups: SplitGroup[] = []
      for (let start = 0; start < cards.length; start += size) {
        groups.push({ name: `${setName} ${groups.length + 1}`, cards: cards.slice(start, start + size) })
      }
      return groups
    }
    case 'starred':
      return [
        { name: `${setName} ★`, cards: cards.filter((card) => card.starred) },
        { name: `${setName} その他`, cards: cards.filter((card) => !card.starred) },
      ].filter((group) => group.cards.length > 0)
    case 'manual': {
      const ids = new Set(rule.cardIds)
      const picked = cards.filter((card) => ids.has(card.id))
      return picked.length === 0 ? [] : [{ name: rule.name.trim(), cards: picked }]
    }
  }
}

export interface SplitOptions {
  setId: string
  rule: SplitRule
  /** 分割先のフォルダ */
  folderId: string | null
  /** true なら元のセットから該当カードを取り除く (移動). false なら元のセットを残す (複製) */
  moveCards: boolean
}

export interface SplitResult {
  setIds: string[]
  /** すべてのカードを移したため, 空になった元のセットを削除したか */
  sourceDeleted: boolean
}

/** 学習セットを分割する. 分割先は元の進捗とリッチコンテンツ設定を引き継ぐ (§4.9.3, §4.4.4) */
export async function splitSet(options: SplitOptions): Promise<SplitResult> {
  return db.transaction('rw', SCOPE, async () => {
    const source = await db.sets.get(options.setId)
    if (source === undefined) throw new Error('分割するセットが見つかりません.')
    const cards = await listCards(source.id)
    const groups = planSplit(source.name, cards, options.rule)
    if (groups.length === 0) throw new Error('切り出すカードがありません.')

    const now = Date.now()
    let order = nextOrder(await listSetsInFolder(options.folderId))
    const setIds: string[] = []
    for (const group of groups) {
      const created: StudySet = {
        ...source,
        id: newId(),
        name: group.name,
        description: source.description,
        folderId: options.folderId,
        order,
        createdAt: now,
        updatedAt: now,
      }
      order += 1
      await db.sets.add(created)
      await cloneCards(group.cards, {
        targetSetId: created.id,
        startOrder: 0,
        keepProgress: true,
        now,
      })
      setIds.push(created.id)
    }

    let sourceDeleted = false
    if (options.moveCards) {
      const moved = groups.flatMap((group) => group.cards)
      if (moved.length === cards.length) {
        // すべて移すと元のセットは空の殻になる. 残しても使い道がないため, セットごと削除する
        await deleteSet(source.id)
        sourceDeleted = true
      } else {
        await removeCards(moved)
        await db.sets.update(source.id, { updatedAt: now })
      }
    }

    return { setIds, sourceDeleted }
  })
}

// ---------------- フォルダのコピー (§4.1, v3.7) ----------------

/**
 * フォルダを中身ごと複製する. 複製した最上位のフォルダの ID を返す.
 *
 * 下位フォルダと学習セットを階層を保って複製し, 最上位は元と同じ階層に置く.
 * 学習セットの扱いはセットのコピーの既定 (★とリッチコンテンツ設定を引き継ぎ,
 * 進捗は引き継がない) に揃える.
 */
export async function copyFolder(folderId: string): Promise<string> {
  return db.transaction('rw', [db.folders, ...SCOPE], async () => {
    const folders = await db.folders.toArray()
    const root = folders.find((folder) => folder.id === folderId)
    if (root === undefined) throw new Error('コピー元のフォルダが見つかりません.')

    const now = Date.now()
    const subtreeIds = collectSubtreeIds(folders, folderId)
    const idMap = new Map(subtreeIds.map((id) => [id, newId()]))
    // subtreeIds の ID は必ず idMap にある. 型の上で undefined を消すための写像
    const mapId = (id: string) => idMap.get(id) ?? id
    const byId = new Map(folders.map((folder) => [folder.id, folder]))

    const newFolders: Folder[] = []
    for (const id of subtreeIds) {
      const folder = byId.get(id)
      if (folder === undefined) continue
      const isRoot = id === folderId
      newFolders.push({
        ...folder,
        id: mapId(id),
        name: isRoot ? `${folder.name} のコピー` : folder.name,
        parentId: isRoot ? folder.parentId : folder.parentId === null ? null : mapId(folder.parentId),
        order: isRoot ? nextOrder(listChildFolders(folders, folder.parentId)) : folder.order,
        createdAt: now,
        updatedAt: now,
      })
    }
    await db.folders.bulkAdd(newFolders)

    const subtree = new Set(subtreeIds)
    const sets = (await db.sets.toArray()).filter(
      (set) => set.folderId !== null && subtree.has(set.folderId),
    )
    for (const set of sets) {
      const copy: StudySet = {
        ...set,
        id: newId(),
        folderId: set.folderId === null ? null : mapId(set.folderId),
        createdAt: now,
        updatedAt: now,
      }
      await db.sets.add(copy)
      await cloneCards(await listCards(set.id), {
        targetSetId: copy.id,
        startOrder: 0,
        keepProgress: false,
        now,
      })
    }
    return mapId(folderId)
  })
}
