import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * 「戻る」の共通の動き (specs.md §6.4)。
 *
 * 同じ画面へ複数の入口があるため, 行き先を決め打ちにすると来た道と食い違う。
 * たとえば統合画面はホームの ⋯ とセット詳細の ⋯ の両方から開ける。
 * そこで履歴を1つ戻し, 直前に見ていた画面へ必ず帰るようにする。
 *
 * URL を直接開いた場合など, アプリ内に戻り先がないときだけ fallback へ向かう。
 * React Router は履歴の最初の項目に 'default' という key を与えるため,
 * これでアプリ内の履歴の有無を判別できる。
 */
export function useGoBack(fallback: string = '/') {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    if (location.key === 'default') navigate(fallback, { replace: true })
    else navigate(-1)
  }, [fallback, location.key, navigate])
}
