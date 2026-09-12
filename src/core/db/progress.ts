import type { CardProgress, ProgressStatus } from '../types'
import { db } from './db'

export function listProgress(setId: string): Promise<CardProgress[]> {
  return db.progress.where('setId').equals(setId).toArray()
}

/** カードID から進捗を引ける表にする. キュー構築と結果集計で使う */
export async function loadProgressMap(setId: string): Promise<Map<string, CardProgress>> {
  const records = await listProgress(setId)
  return new Map(records.map((record) => [record.cardId, record]))
}

/**
 * 暗記モードの判定を反映する (specs.md §4.6.3).
 * 「1つ戻る」で判定前の値へ戻せるよう, 呼び出し側が元の status を保持しておく.
 */
export async function setStatus(cardId: string, status: ProgressStatus): Promise<void> {
  await db.progress.update(cardId, { status, lastAnsweredAt: Date.now() })
}

/**
 * 「1つ戻る」で status を判定前へ復元する (specs.md §4.6.4).
 * 復元であるため lastAnsweredAt は書き換えない.
 */
export async function restoreStatus(cardId: string, status: ProgressStatus): Promise<void> {
  await db.progress.update(cardId, { status })
}

/** 「最初からやり直す」(specs.md §4.6.6). 中断状態も破棄する */
export async function resetProgress(setId: string): Promise<void> {
  await db.transaction('rw', db.progress, db.sessions, async () => {
    await db.progress
      .where('setId')
      .equals(setId)
      .modify({ status: 'unseen', lastAnsweredAt: null })
    await db.sessions.delete(setId)
  })
}

/**
 * 4択の解答を反映する (specs.md §4.7.3).
 * 1回の正答で習得済, 誤答とパスで学習中にする. あわせて累計の正答数・誤答数を加算する.
 */
export async function recordQuizAnswer(cardId: string, correct: boolean): Promise<void> {
  await db.transaction('rw', db.progress, async () => {
    const record = await db.progress.get(cardId)
    if (record === undefined) return
    await db.progress.update(cardId, {
      status: correct ? 'known' : 'learning',
      lastAnsweredAt: Date.now(),
      quizCorrect: record.quizCorrect + (correct ? 1 : 0),
      quizWrong: record.quizWrong + (correct ? 0 : 1),
    })
  })
}
