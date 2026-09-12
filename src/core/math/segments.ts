// 文中の数式の切り出し (specs.md §4.4.3).
//
// KaTeX へ渡す前に, どこからどこまでが数式かをここで決める. 描画そのものは UI 側で行う.
// 解析は数式が有効なセットに限って呼ぶ. 無効なセットで $ を解釈すると,
// 金額表記などを数式として誤って拾ってしまうためである.

export type MathSegment =
  | { kind: 'text'; value: string }
  /** $ ... $ */
  | { kind: 'inline'; value: string }
  /** $$ ... $$ */
  | { kind: 'block'; value: string }

/** 閉じ記号を探す. \$ は文字としての $ なので閉じ記号とみなさない */
function findClosing(text: string, from: number, mark: string): number {
  let index = from
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2
      continue
    }
    if (text.startsWith(mark, index)) return index
    index += 1
  }
  return -1
}

/**
 * テキストを地の文と数式に切り分ける.
 *
 * 閉じ記号のない $ は数式の書きかけではなく, ただの記号とみなして地の文に残す.
 * 入力の途中で画面が崩れるのを防ぐためである.
 */
export function parseMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (buffer !== '') {
      segments.push({ kind: 'text', value: buffer })
      buffer = ''
    }
  }

  while (index < text.length) {
    const char = text[index]

    // \$ と書かれた場合は文字としての $ を出す
    if (char === '\\' && text[index + 1] === '$') {
      buffer += '$'
      index += 2
      continue
    }
    if (char !== '$') {
      buffer += char
      index += 1
      continue
    }

    const isBlock = text[index + 1] === '$'
    const mark = isBlock ? '$$' : '$'
    const start = index + mark.length
    const end = findClosing(text, start, mark)
    const value = end === -1 ? '' : text.slice(start, end).trim()
    if (end === -1 || value === '') {
      // 閉じていない, または中身が空. 記号として残す
      buffer += char
      index += 1
      continue
    }

    flush()
    segments.push({ kind: isBlock ? 'block' : 'inline', value })
    index = end + mark.length
  }

  flush()
  return segments
}

/** 数式を含むか. セット設定で数式を無効にする際の確認に用いる (specs.md §4.4.1) */
export function containsMath(text: string): boolean {
  return parseMathSegments(text).some((segment) => segment.kind !== 'text')
}
