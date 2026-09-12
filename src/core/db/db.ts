import Dexie, { type EntityTable } from 'dexie'
import type {
  AppSettings,
  Asset,
  Card,
  CardProgress,
  Folder,
  QuizOptions,
  StudyOptions,
  StudySession,
  StudySet,
} from '../types'
import { DEFAULT_QUIZ_OPTIONS, DEFAULT_STUDY_OPTIONS } from '../study/options'

/**
 * IndexedDB のスキーマ定義 (specs.md §2).
 *
 * 段階1 で用いるのは folders / sets / cards / progress の4つだが, テーブルは
 * 最初からすべて宣言する. 後から stores() に追加するとバージョンを上げる必要があり,
 * 既存データの移行処理を書くことになるため, 空のまま用意しておくほうが安い.
 */
export const db = new Dexie('flashcard-app') as Dexie & {
  folders: EntityTable<Folder, 'id'>
  sets: EntityTable<StudySet, 'id'>
  cards: EntityTable<Card, 'id'>
  assets: EntityTable<Asset, 'id'>
  progress: EntityTable<CardProgress, 'cardId'>
  sessions: EntityTable<StudySession, 'setId'>
  settings: EntityTable<AppSettings, 'id'>
}

// stores() に列挙するのは主キーと索引だけである. 他の項目は宣言しなくても保存される.
// starred を索引にしないのは, IndexedDB が真偽値をキーとして扱えないためである.
db.version(1).stores({
  folders: 'id, parentId, order',
  sets: 'id, folderId, order',
  cards: 'id, setId, order, normalized, [setId+order]',
  assets: 'id, setId',
  progress: 'cardId, setId, status, [setId+status]',
  sessions: 'setId',
  settings: 'id',
})

// v3.3 で StudySet に studyOptions を追加した. 索引は変わらないため stores() は
// 呼ばず, 既存のセットに既定値を埋める移行だけを行う.
// (新規に作られる DB では最初から createSet が値を入れるので, この処理は走らない)
db.version(2).upgrade(async (tx) => {
  await tx
    .table('sets')
    .toCollection()
    .modify((set: { studyOptions?: StudyOptions }) => {
      set.studyOptions ??= DEFAULT_STUDY_OPTIONS
    })
})

// v3.6 で StudySet に quizOptions を追加した. 版2と同じく索引は変わらないため,
// 既存のセットに既定値を埋める移行だけを行う.
db.version(3).upgrade(async (tx) => {
  await tx
    .table('sets')
    .toCollection()
    .modify((set: { quizOptions?: QuizOptions }) => {
      set.quizOptions ??= DEFAULT_QUIZ_OPTIONS
    })
})

/** ID の採番. specs.md の規約により crypto.randomUUID() を用いる */
export function newId(): string {
  return crypto.randomUUID()
}

/** 同一階層内の末尾に置くための order を求める */
export function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order), -1) + 1
}
