// テキストインポートの解析 ( specs.md §4.5 ).
// Word / Excel / Google ドキュメントからの貼り付けを想定する.

/** 用語と定義のあいだの区切り */
export type TermSeparator = 'tab' | 'comma' | 'custom'

/** カードとカードのあいだの区切り */
export type CardSeparator = 'newline' | 'semicolon' | 'custom'

export interface ImportOptions {
  termSeparator: TermSeparator
  termCustom: string
  cardSeparator: CardSeparator
  cardCustom: string
}

/** 既定値は Tab 区切り / 改行区切り ( specs.md §4.5 ) */
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  termSeparator: 'tab',
  termCustom: '',
  cardSeparator: 'newline',
  cardCustom: '',
}

export interface ParsedCard {
  term: string
  definition: string
  /** 区切り文字が現れず, 定義が空のまま取り込まれる行. プレビューで警告する */
  missingDefinition: boolean
}

export interface ParseResult {
  cards: ParsedCard[]
  missingDefinitionCount: number
}

/** 用語と定義の区切りに用いる実際の文字列. 決められない場合は null */
function resolveTermSeparator(options: ImportOptions): string | null {
  switch (options.termSeparator) {
    case 'tab':
      return '\t'
    case 'comma':
      return ','
    case 'custom':
      return options.termCustom === '' ? null : options.termCustom
  }
}

/**
 * カード区切りでテキストを分割する.
 *
 * 改行は環境によって CRLF / CR / LF が混ざるため, 正規表現でまとめて扱う.
 */
function splitIntoChunks(text: string, options: ImportOptions): string[] | null {
  switch (options.cardSeparator) {
    case 'newline':
      return text.split(/\r\n|\r|\n/)
    case 'semicolon':
      return text.split(';')
    case 'custom':
      // 空文字列で split すると1文字ずつに分解されてしまうため, 未指定は解析しない
      return options.cardCustom === '' ? null : text.split(options.cardCustom)
  }
}

/** 貼り付けたテキストをカードの並びに変換する */
export function parseImportText(text: string, options: ImportOptions): ParseResult {
  const termSeparator = resolveTermSeparator(options)
  const chunks = splitIntoChunks(text, options)
  if (termSeparator === null || chunks === null) {
    return { cards: [], missingDefinitionCount: 0 }
  }

  const cards: ParsedCard[] = []
  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (trimmed === '') continue // 空行は破棄する

    const index = trimmed.indexOf(termSeparator)
    if (index === -1) {
      // 区切りが1つも現れない行は用語のみが与えられたものとして扱う
      cards.push({ term: trimmed, definition: '', missingDefinition: true })
      continue
    }

    // 区切りが複数あっても最初の1つでのみ分割する.
    // 「機密性, 完全性, 可用性」のようにカンマを含む定義を壊さないため ( specs.md §4.5 ).
    const term = trimmed.slice(0, index).trim()
    const definition = trimmed.slice(index + termSeparator.length).trim()
    if (term === '' && definition === '') continue
    cards.push({ term, definition, missingDefinition: definition === '' })
  }

  return {
    cards,
    missingDefinitionCount: cards.filter((card) => card.missingDefinition).length,
  }
}

/** 用語と定義の組を一意に表す鍵. 完全一致の判定に用いる */
function duplicateKey(card: { term: string; definition: string }): string {
  return `${card.term}\n${card.definition}`
}

export interface DeduplicateResult {
  kept: ParsedCard[]
  /** 除外した枚数 */
  removed: number
}

/**
 * 各カードが重複として除外される対象かどうかを, 元の並びのまま返す.
 *
 * 取り込み先に既にあるカードとの重複だけでなく, 貼り付けたテキスト内での重複も対象とする.
 * 同じ用語表を二度貼ってしまう場面が実際に多いためである.
 * プレビューで「どの行が落ちるか」を示せるよう, 除外そのものとは別の関数にしてある.
 */
export function findDuplicateFlags(
  cards: readonly ParsedCard[],
  existing: readonly { term: string; definition: string }[],
): boolean[] {
  const seen = new Set(existing.map(duplicateKey))
  return cards.map((card) => {
    const key = duplicateKey(card)
    if (seen.has(key)) return true
    seen.add(key)
    return false
  })
}

/** 用語と定義が完全に一致するカードを除外する ( specs.md §4.5 ) */
export function excludeDuplicates(
  cards: readonly ParsedCard[],
  existing: readonly { term: string; definition: string }[],
): DeduplicateResult {
  const flags = findDuplicateFlags(cards, existing)
  const kept = cards.filter((_, index) => !flags[index])
  return { kept, removed: cards.length - kept.length }
}
