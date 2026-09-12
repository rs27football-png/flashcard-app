import type { Card, CardProgress, StudyOptions } from '../types'

/** キューが空になった理由. 利用者に何が起きたかを伝えるために区別する (specs.md §4.6.1) */
export type EmptyReason = 'no-cards' | 'no-starred' | 'all-known'

export interface QueueResult {
  /** 出題順のカードID配列 */
  cardIds: string[]
  /** 空になった理由. cardIds が空でなければ null */
  emptyReason: EmptyReason | null
}

/**
 * Fisher-Yates シャッフル.
 *
 * sort(() => Math.random() - 0.5) は比較関数が一貫しないため分布が偏る. 使わない.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * ラウンド開始時のキューを構築する (specs.md §4.6.1).
 *
 * 絞り込みの順序は仕様どおり ★ → 習得済の除外 → 並べ替え とする.
 * 途中で0枚になった段階を見て理由を決めるため, 各段で件数を確認している.
 */
export function buildQueue(
  cards: readonly Card[],
  progressByCardId: ReadonlyMap<string, CardProgress>,
  options: StudyOptions,
): QueueResult {
  if (cards.length === 0) {
    return { cardIds: [], emptyReason: 'no-cards' }
  }

  let candidates = cards
  if (options.starredOnly) {
    candidates = candidates.filter((card) => card.starred)
    if (candidates.length === 0) {
      return { cardIds: [], emptyReason: 'no-starred' }
    }
  }

  if (options.trackProgress) {
    candidates = candidates.filter(
      (card) => progressByCardId.get(card.id)?.status !== 'known',
    )
    if (candidates.length === 0) {
      return { cardIds: [], emptyReason: 'all-known' }
    }
  }

  const ordered = options.shuffle
    ? shuffle(candidates)
    : [...candidates].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)

  return { cardIds: ordered.map((card) => card.id), emptyReason: null }
}

/**
 * 結果画面から「学習中の N 枚を続ける」で次ラウンドを組む (specs.md §4.6.5).
 * 未学習は含めず, status が learning のものだけを対象とする.
 */
export function buildLearningQueue(
  cards: readonly Card[],
  progressByCardId: ReadonlyMap<string, CardProgress>,
  options: StudyOptions,
): string[] {
  const candidates = cards.filter(
    (card) =>
      progressByCardId.get(card.id)?.status === 'learning' &&
      (!options.starredOnly || card.starred),
  )
  const ordered = options.shuffle
    ? shuffle(candidates)
    : [...candidates].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  return ordered.map((card) => card.id)
}
