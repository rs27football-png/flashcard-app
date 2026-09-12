/**
 * 数式の入力補助 (specs.md §4.4.3)。
 *
 * 頻用の記法をボタンで挿入する。スマートフォンでは `\` や `{}` の入力が面倒で,
 * これがないと数式を書く気が失せるためである。
 */

interface Snippet {
  label: string
  /** 挿入する文字列 */
  text: string
  /** 挿入後のカーソル位置。文字列の先頭からの文字数 */
  caret: number
}

const SNIPPETS: readonly Snippet[] = [
  { label: '$ $', text: '$$', caret: 1 },
  { label: '$$ $$', text: '$$$$', caret: 2 },
  { label: '分数', text: '\\frac{}{}', caret: 6 },
  { label: '累乗', text: '^{}', caret: 2 },
  { label: '添字', text: '_{}', caret: 2 },
  { label: '根号', text: '\\sqrt{}', caret: 6 },
  { label: '総和', text: '\\sum_{i=1}^{n}', caret: 14 },
  { label: '積分', text: '\\int_{a}^{b}', caret: 12 },
  { label: '極限', text: '\\lim_{x \\to 0}', caret: 14 },
  { label: '×', text: '\\times ', caret: 7 },
  { label: '≦', text: '\\leq ', caret: 5 },
  { label: '→', text: '\\to ', caret: 4 },
]

interface MathPaletteProps {
  onInsert: (text: string, caret: number) => void
}

export function MathPalette({ onInsert }: MathPaletteProps) {
  return (
    <div className="math-palette" role="group" aria-label="数式の入力補助">
      {SNIPPETS.map((snippet) => (
        <button
          key={snippet.label}
          type="button"
          className="btn btn--small"
          // ボタンを押した拍子に入力欄からフォーカスが外れると挿入先を見失う
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(snippet.text, snippet.caret)}
        >
          {snippet.label}
        </button>
      ))}
    </div>
  )
}
