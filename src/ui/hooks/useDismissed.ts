import { useCallback, useState } from 'react'

/** 二度と出さないものに使う期限 */
const FOREVER = Number.MAX_SAFE_INTEGER

const DAY = 24 * 60 * 60 * 1000

/**
 * 読み書きは必ず握りつぶす. 無効にしている環境では例外が飛ぶが,
 * 表示の都合にすぎないため, 既定の「閉じていない」で続ければよい.
 */
function readUntil(key: string): number {
  try {
    return Number(window.localStorage.getItem(key) ?? 0)
  } catch {
    return 0
  }
}

function writeUntil(key: string, until: number): void {
  try {
    window.localStorage.setItem(key, String(until))
  } catch {
    // 記録できなくても, その回の表示を消すだけで用は足りる
  }
}

/**
 * 知らせを閉じた状態を覚える (specs.md §6.2)。
 *
 * 条件が続く限り再び出すが, 閉じた直後に出し続けては邪魔になるため,
 * 指定した日数のあいだは伏せる。端末ごとの表示の都合にすぎず,
 * 失われても害がないため localStorage に置く。
 *
 * @param cooldownDays 伏せておく日数. 省略すると二度と出さない
 */
export function useDismissed(key: string, cooldownDays?: number): [boolean, () => void] {
  const storageKey = `notice.${key}`
  const [until, setUntil] = useState(() => readUntil(storageKey))
  // 描画のたびに現在時刻を読むと結果が揺れる. 画面を開いた時点の値で固定する
  const [openedAt] = useState(() => Date.now())

  const dismiss = useCallback(() => {
    const next = cooldownDays === undefined ? FOREVER : Date.now() + cooldownDays * DAY
    writeUntil(storageKey, next)
    setUntil(next)
  }, [cooldownDays, storageKey])

  return [openedAt < until, dismiss]
}
