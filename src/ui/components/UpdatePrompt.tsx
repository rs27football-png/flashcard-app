import { useRegisterSW } from 'virtual:pwa-register/react'
import { Icon } from './Icon'

/**
 * 更新とオフライン準備の知らせ (specs.md §6.1)。
 *
 * 学習の最中に勝手に読み込み直すと, めくっている札や解答中の問題が消える。
 * そのため自動では入れ替えず, 「更新する」を押したときだけ切り替える。
 */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      // 端末や設定によっては Service Worker を使えない. その場合もオンラインでは
      // 通常どおり動くため, 画面には出さず黙って諦める
    },
  })

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      <p className="pwa-toast__text">
        {needRefresh ? '新しい版があります。' : 'オフラインでも使えるようになりました。'}
      </p>
      <div className="pwa-toast__actions">
        {needRefresh && (
          <button
            type="button"
            className="btn btn--small btn--primary"
            onClick={() => void updateServiceWorker(true)}
          >
            <Icon name="refresh" size={15} />
            更新する
          </button>
        )}
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            setOfflineReady(false)
            setNeedRefresh(false)
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
