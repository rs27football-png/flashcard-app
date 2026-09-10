import type { ProgressSummary, StudyOptions, StudySet } from '../types'
import { DEFAULT_STUDY_OPTIONS } from '../study/options'
import { deleteCardsOfSet } from './cards'
import { db, newId, nextOrder } from './db'

export interface StudySetInput {
  name: string
  description: string
  folderId: string | null
}

/** 指定フォルダ直下の学習セットを表示順で返す. folderId が null ならルート直下 */
export async function listSetsInFolder(folderId: string | null): Promise<StudySet[]> {
  const sets = await db.sets.toArray()
  return sets
    .filter((set) => set.folderId === folderId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export function listAllSets(): Promise<StudySet[]> {
  return db.sets.toArray()
}

export function getSet(id: string): Promise<StudySet | undefined> {
  return db.sets.get(id)
}

export async function createSet(input: StudySetInput): Promise<StudySet> {
  const now = Date.now()
  const set: StudySet = {
    id: newId(),
    name: input.name.trim(),
    description: input.description.trim(),
    folderId: input.folderId,
    order: nextOrder(await listSetsInFolder(input.folderId)),
    // リッチコンテンツは新規セットでは無効とする ( specs.md §4.4.1 )
    enableImages: false,
    enableMath: false,
    studyOptions: DEFAULT_STUDY_OPTIONS,
    createdAt: now,
    updatedAt: now,
  }
  await db.sets.add(set)
  return set
}

export async function updateSet(id: string, input: StudySetInput): Promise<void> {
  const current = await db.sets.get(id)
  if (!current) return
  // フォルダをまたぐときは移動先の末尾に置く. 元の order のままだと既存セットと重なるため.
  const order =
    current.folderId === input.folderId
      ? current.order
      : nextOrder(await listSetsInFolder(input.folderId))
  await db.sets.update(id, {
    name: input.name.trim(),
    description: input.description.trim(),
    folderId: input.folderId,
    order,
    updatedAt: Date.now(),
  })
}

/** セットを削除する. 配下のカード・進捗・画像・中断状態も連動して削除する ( specs.md §4.2 ) */
export async function deleteSet(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.sets,
    db.cards,
    db.progress,
    db.assets,
    db.sessions,
    async () => {
      await deleteCardsOfSet(id)
      await db.sessions.delete(id)
      await db.sets.delete(id)
    },
  )
}

/** 複数セットの一括削除. フォルダの一括削除から呼ぶ */
export async function deleteSets(ids: readonly string[]): Promise<void> {
  await db.transaction(
    'rw',
    db.sets,
    db.cards,
    db.progress,
    db.assets,
    db.sessions,
    async () => {
      for (const id of ids) await deleteSet(id)
    },
  )
}

/** セット詳細画面の進捗サマリ ( specs.md §4.2 ) */
export async function getProgressSummary(setId: string): Promise<ProgressSummary> {
  const records = await db.progress.where('setId').equals(setId).toArray()
  const summary: ProgressSummary = {
    total: records.length,
    known: 0,
    learning: 0,
    unseen: 0,
  }
  for (const record of records) summary[record.status] += 1
  return summary
}

/**
 * セットごとのカード枚数を数える.
 * 一覧に枚数を出すためだけに全カードを読み込むと1万枚のときに重くなるため,
 * setId の索引を使った件数取得で済ませる.
 */
export async function countCardsPerSet(): Promise<Map<string, number>> {
  const sets = await db.sets.toArray()
  const counts = new Map<string, number>()
  for (const set of sets) {
    counts.set(set.id, await db.cards.where('setId').equals(set.id).count())
  }
  return counts
}

/** 1つのセットのカード枚数. 削除確認などに用いる */
export function countCardsInSet(setId: string): Promise<number> {
  return db.cards.where('setId').equals(setId).count()
}

/**
 * 学習オプションを記憶する ( specs.md §2.7 ).
 * 次回の学習開始時の既定値になる.
 */
export async function updateStudyOptions(
  setId: string,
  studyOptions: StudyOptions,
): Promise<void> {
  await db.sets.update(setId, { studyOptions })
}
