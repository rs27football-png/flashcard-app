import type { StudyOptions, StudySession } from '../types'
import { db } from './db'

/** 中断状態はセットごとに1件だけ保持する ( specs.md §2.6 ) */
export function getSession(setId: string): Promise<StudySession | undefined> {
  return db.sessions.get(setId)
}

export async function saveSession(session: Omit<StudySession, 'updatedAt'>): Promise<void> {
  await db.sessions.put({ ...session, updatedAt: Date.now() })
}

/** 学習完了時, および「最初からやり直す」実行時に削除する ( specs.md §2.6 ) */
export async function deleteSession(setId: string): Promise<void> {
  await db.sessions.delete(setId)
}

/** 保存されている中断状態が, 今のカード構成でそのまま再開できるかを判定する */
export function isSessionUsable(
  session: StudySession,
  existingCardIds: ReadonlySet<string>,
  mode: StudySession['mode'],
  options: StudyOptions,
): boolean {
  if (session.mode !== mode) return false
  // 1枚も判定していない中断は, 最初から始めるのと変わらないので提示しない
  if (session.currentIndex <= 0) return false
  if (session.currentIndex >= session.queue.length) return false
  // 学習中にカードを消した場合など, キューが現状と食い違うときは再開させない
  if (!session.queue.every((cardId) => existingCardIds.has(cardId))) return false
  // オプションを変えて開始したときは, 前回の並びを引き継がない
  return (
    session.options.trackProgress === options.trackProgress &&
    session.options.starredOnly === options.starredOnly &&
    session.options.front === options.front
  )
}
