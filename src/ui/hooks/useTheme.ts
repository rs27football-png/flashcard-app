import { useEffect } from 'react'
import type { AppSettings } from '../../core/types'

/** テーマごとの下地の色。iOS の状態表示欄をこの色に合わせる */
const THEME_COLOR = { dark: '#14161a', light: '#f4f5f7' } as const

/**
 * テーマを画面に反映する (specs.md §4.12)。
 *
 * 色は CSS 変数だけで持たせてあるため, ここでは root の目印を付け替えるだけでよい。
 * システム追従のときは目印を外し, 端末の設定 (prefers-color-scheme) に任せる。
 */
export function useTheme(theme: AppSettings['theme']): void {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)

    // ホーム画面から開いたときの上下の余白の色。地の色と合わないと帯が浮く
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta === null) return
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme
    meta.setAttribute('content', THEME_COLOR[resolved])
  }, [theme])
}
