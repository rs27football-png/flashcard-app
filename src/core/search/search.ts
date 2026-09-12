// 全セット横断検索 (specs.md §4.10).
import type { Card, StudySet } from '../types'
import { findMatches, type MatchRange } from './highlight'
import { normalizeForSearch } from './normalize'

/** 一度に表示するカードの上限. 1文字で検索すると数千件が一致し, 描画が重くなるため */
export const MAX_CARD_HITS = 200

export interface CardHit {
  card: Card
  term: MatchRange[]
  definition: MatchRange[]
  hint: MatchRange[]
}

export interface SearchResult {
  /** セット名が一致した学習セット */
  sets: StudySet[]
  /** 内容が一致したカード. 最大 MAX_CARD_HITS 件 */
  cards: CardHit[]
  /** 一致したカードの総数. 上限で打ち切った分も含む */
  totalCards: number
}

const EMPTY: SearchResult = { sets: [], cards: [], totalCards: 0 }

/**
 * 用語・定義・ヒント・学習セット名を検索する.
 *
 * scopeSetIds を渡すと, そのセットに属するものだけを対象にする (フォルダによる絞り込み).
 * カードはまず保存時に作った正規化済みの列で絞り込み (specs.md §2.3, §6.3),
 * 一致箇所の計算は絞り込んだカードに対してだけ行う.
 */
export function search(
  query: string,
  cards: readonly Card[],
  sets: readonly StudySet[],
  scopeSetIds: ReadonlySet<string> | null,
): SearchResult {
  const normalizedQuery = normalizeForSearch(query.trim())
  if (normalizedQuery === '') return EMPTY

  const inScope = (setId: string) => scopeSetIds === null || scopeSetIds.has(setId)

  // セットは件数が少ないため, 名前を検索のたびに正規化しても負担にならない
  const matchedSets = sets.filter(
    (set) => inScope(set.id) && normalizeForSearch(set.name).includes(normalizedQuery),
  )

  const hits: CardHit[] = []
  let totalCards = 0
  for (const card of cards) {
    if (!inScope(card.setId)) continue
    if (!card.normalized.includes(normalizedQuery)) continue
    totalCards += 1
    if (hits.length >= MAX_CARD_HITS) continue
    hits.push({
      card,
      term: findMatches(card.term, normalizedQuery),
      definition: findMatches(card.definition, normalizedQuery),
      hint: findMatches(card.hint, normalizedQuery),
    })
  }

  return { sets: matchedSets, cards: hits, totalCards }
}
