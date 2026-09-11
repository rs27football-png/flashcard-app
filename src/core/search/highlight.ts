// 検索語に一致した箇所の特定 ( specs.md §4.10 ).
import { normalizeForSearch } from './normalize'

/** 元の文字列における一致範囲. end は含まない ( slice と同じ扱い ) */
export interface MatchRange {
  start: number
  end: number
}

/** 表示用に切り分けた断片. hit が true の断片を強調する */
export interface Segment {
  text: string
  hit: boolean
}

// 半角の濁点・半濁点. 直前の文字と一緒に NFKC にかけないと「ｶﾞ」が「ガ」にならない
const HALF_WIDTH_SOUND_MARKS = new Set(['ﾞ', 'ﾟ'])

/**
 * 元の文字列の中から, 正規化済みの検索語に一致する範囲を探す.
 *
 * 照合は正規化後の文字列で行うが, 強調は元の文字列に対して行う必要がある.
 * NFKC は文字数を変えることがある ( 「ｶﾞ」の2文字が「ガ」の1文字になる ) ため,
 * 文字の単位ごとに正規化し, 正規化後の位置から元の位置を引ける対応表を作る.
 */
export function findMatches(original: string, normalizedQuery: string): MatchRange[] {
  if (normalizedQuery === '' || original === '') return []

  let normalized = ''
  /** normalized の各文字が, 元の文字列のどこから来たか */
  const sourceStart: number[] = []
  const sourceEnd: number[] = []

  let index = 0
  while (index < original.length) {
    const codePoint = original.codePointAt(index) ?? 0
    let next = index + (codePoint > 0xffff ? 2 : 1)
    while (next < original.length && HALF_WIDTH_SOUND_MARKS.has(original[next])) next += 1

    const unit = normalizeForSearch(original.slice(index, next))
    for (let k = 0; k < unit.length; k += 1) {
      sourceStart.push(index)
      sourceEnd.push(next)
    }
    normalized += unit
    index = next
  }

  const ranges: MatchRange[] = []
  let from = 0
  for (;;) {
    const at = normalized.indexOf(normalizedQuery, from)
    if (at === -1) break
    ranges.push({ start: sourceStart[at], end: sourceEnd[at + normalizedQuery.length - 1] })
    from = at + normalizedQuery.length
  }
  return ranges
}

/** 一致範囲で文字列を切り分ける. 画面はこの断片を順に描き, hit の断片だけを強調する */
export function toSegments(original: string, ranges: readonly MatchRange[]): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: original.slice(cursor, range.start), hit: false })
    segments.push({ text: original.slice(range.start, range.end), hit: true })
    cursor = range.end
  }
  if (cursor < original.length) segments.push({ text: original.slice(cursor), hit: false })
  return segments
}
