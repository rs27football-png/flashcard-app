// 検索用の正規化 ( specs.md §4.10 ).
//
// 適用順序が重要である. NFKC を先に行わないと半角カナが全角カナに揃わず,
// 後段のひらがな化が働かないため, 「ﾈｯﾄﾜｰｸ」が「ねっとわーく」で拾えなくなる.

const KATAKANA_START = 0x30a1 // ァ
const KATAKANA_END = 0x30f6 // ヶ
const KANA_OFFSET = 0x60 // カタカナとひらがなのコードポイント差

/**
 * カタカナをひらがなへ変換する.
 *
 * U+30F7〜U+30FA ( ヷヸヹヺ ) には対応するひらがなが存在しないため, 上限を U+30F6 とし
 * 変換対象から除外している. 長音符 ( U+30FC ) も範囲外なのでそのまま残る.
 */
function katakanaToHiragana(input: string): string {
  let result = ''
  for (const char of input) {
    const code = char.codePointAt(0)
    if (code !== undefined && code >= KATAKANA_START && code <= KATAKANA_END) {
      result += String.fromCodePoint(code - KANA_OFFSET)
    } else {
      result += char
    }
  }
  return result
}

/**
 * 検索の照合に用いる正規化を適用する.
 * NFKC 正規化 → 小文字化 → カタカナのひらがな化 の順に行う.
 */
export function normalizeForSearch(input: string): string {
  return katakanaToHiragana(input.normalize('NFKC').toLowerCase())
}

/**
 * カードの検索用文字列を組み立てる.
 * 用語・定義・ヒントを改行で連結したうえで正規化する ( specs.md §2.3 ).
 */
export function buildCardNormalized(fields: {
  term: string
  definition: string
  hint: string
}): string {
  return normalizeForSearch([fields.term, fields.definition, fields.hint].join('\n'))
}
