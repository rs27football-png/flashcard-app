import type { FlashcardSession, QuizOptions, QuizSession, StudyOptions, StudySession } from '../types'
import { db } from './db'

/**
 * 保存する際に渡す形. updatedAt は保存時に付ける.
 *
 * Omit を直に union へ当てると, 両者に共通する項目だけが残ってモード固有の項目が
 * 落ちる. 一度ばらしてから適用する.
 */
type Unsaved<T> = T extends unknown ? Omit<T, 'updatedAt'> : never

/** 中断状態はセットとモードの組ごとに1件だけ保持する (specs.md §2.6) */
export function getSession(
  setId: string,
  mode: StudySession['mode'],
): Promise<StudySession | undefined> {
  return db.sessions.get([setId, mode])
}

export async function saveSession(session: Unsaved<StudySession>): Promise<void> {
  await db.sessions.put({ ...session, updatedAt: Date.now() })
}

/** 学習完了時, および「最初からやり直す」実行時に削除する (specs.md §2.6) */
export async function deleteSession(setId: string, mode: StudySession['mode']): Promise<void> {
  await db.sessions.delete([setId, mode])
}

/** セットの削除や進捗のリセットに連動して, そのセットの中断をすべて捨てる */
export async function deleteSessionsOfSet(setId: string): Promise<void> {
  await db.sessions.where('setId').equals(setId).delete()
}

/** キューが今のカード構成でそのまま使えるか. 両モードに共通する判定 */
function isQueueUsable(session: StudySession, existingCardIds: ReadonlySet<string>): boolean {
  // 1問も進めていない中断は, 最初から始めるのと変わらないので提示しない
  if (session.currentIndex <= 0) return false
  if (session.currentIndex >= session.queue.length) return false
  // 学習中にカードを消した場合など, キューが現状と食い違うときは再開させない
  return session.queue.every((cardId) => existingCardIds.has(cardId))
}

/** 保存されている暗記モードの中断が, そのまま再開できるか */
export function isFlashcardSessionUsable(
  session: StudySession,
  existingCardIds: ReadonlySet<string>,
  options: StudyOptions,
): session is FlashcardSession {
  if (session.mode !== 'flashcard') return false
  if (!isQueueUsable(session, existingCardIds)) return false
  // オプションを変えて開始したときは, 前回の並びを引き継がない.
  // シャッフルの有無は並びとして既にキューに表れているため見ない
  return (
    session.options.trackProgress === options.trackProgress &&
    session.options.starredOnly === options.starredOnly &&
    session.options.front === options.front
  )
}

/** 保存されている4択モードの中断が, そのまま再開できるか (specs.md §4.7.4) */
export function isQuizSessionUsable(
  session: StudySession,
  existingCardIds: ReadonlySet<string>,
  options: QuizOptions,
): session is QuizSession {
  if (session.mode !== 'quiz') return false
  if (!isQueueUsable(session, existingCardIds)) return false
  return (
    session.options.starredOnly === options.starredOnly &&
    session.options.learningOnly === options.learningOnly &&
    session.options.front === options.front
  )
}
