import { useEffect, useMemo, useState } from 'react'
import { parseMathSegments } from '../../core/math/segments'

type Katex = typeof import('katex').default

/**
 * KaTeX は本体と字形だけで 300 KB 近くある。文字だけのセットにこの重さを負わせないため,
 * 数式を有効にしたセットを開いた時点で初めて読み込む (specs.md §4.4)。
 * 読み込みは一度きりで, 以降は同じ約束を使い回す。
 */
let katex: Katex | null = null
let loading: Promise<void> | null = null

function ensureKatex(): Promise<void> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([module]) => {
      katex = module.default
    },
  )
  return loading
}

/**
 * 同じ数式を何度も組み直さないための控え。
 * 暗記モードは1枚めくるたびに再描画されるため, ここで効かせておく。
 */
const cache = new Map<string, string>()

function renderMath(engine: Katex, value: string, block: boolean): string {
  const key = `${block ? 'B' : 'I'}${value}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  // throwOnError: false とするのは, 学習中に構文誤りで画面が止まるのを防ぐため
  // (specs.md §4.4.3)。誤りのある式は元の LaTeX が赤字で出る。
  const html = engine.renderToString(value, {
    displayMode: block,
    throwOnError: false,
    errorColor: '#f87171',
  })
  cache.set(key, html)
  return html
}

interface RichTextProps {
  text: string
  /** 数式として解釈するか。セットで数式が有効なときだけ true にする (specs.md §4.4.3) */
  math: boolean
  className?: string
}

/**
 * 本文の表示 (specs.md §4.4.3)。
 *
 * 数式が無効なセットでは一切解析せず, そのまま文字として出す。
 * 金額表記などの `$` を数式と取り違えないためである。
 */
export function RichText({ text, math, className }: RichTextProps) {
  // 読み込みが済むまではそのままの文字列を出し, 揃い次第 組み直す
  const [engine, setEngine] = useState<Katex | null>(katex)

  useEffect(() => {
    if (!math || engine !== null) return
    let cancelled = false
    void ensureKatex().then(() => {
      if (!cancelled) setEngine(katex)
    })
    return () => {
      cancelled = true
    }
  }, [math, engine])

  const segments = useMemo(
    () => (math && engine !== null ? parseMathSegments(text) : null),
    [engine, math, text],
  )

  if (segments === null || engine === null) return <span className={className}>{text}</span>

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <span
            key={index}
            className={segment.kind === 'block' ? 'math math--block' : 'math'}
            // KaTeX の出力は自前で組み立てた安全な HTML である。入力を素通しはしない
            dangerouslySetInnerHTML={{
              __html: renderMath(engine, segment.value, segment.kind === 'block'),
            }}
          />
        ),
      )}
    </span>
  )
}
