import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getStorageUsage } from '../../core/db/assets'
import { getContentTimestamps } from '../../core/db/sets'
import { DEFAULT_APP_SETTINGS, getAppSettings } from '../../core/db/settings'
import {
  daysSinceSynced,
  isStorageTight,
  needsBackupReminder,
  type BackupStatus,
} from '../../core/backup/reminder'
import { formatBytes } from '../../core/media/compress'
import { Icon } from './Icon'
import { useDismissed } from '../hooks/useDismissed'

const EMPTY_TIMESTAMPS = { latestUpdatedAt: null, firstCreatedAt: null }

/** ホーム画面から起動しているか. iOS は独自の印を使う */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return legacy || window.matchMedia('(display-mode: standalone)').matches
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * ホーム画面に出す知らせ (specs.md §6.2)。
 *
 * いずれもデータを失わないための案内であり, 機能ではない。条件を満たしたときだけ
 * 現れ, 閉じれば一定期間は伏せる。
 */
export function HomeNotices() {
  // 判定は日単位で足りる. 描画のたびに読み直さず, 画面を開いた時点で固定する
  const [now] = useState(() => Date.now())
  const settings = useLiveQuery(() => getAppSettings(), [], DEFAULT_APP_SETTINGS)
  const timestamps = useLiveQuery(() => getContentTimestamps(), [], EMPTY_TIMESTAMPS)
  const usage = useLiveQuery(() => getStorageUsage(), [], null)

  // 催促は条件が続く限り再び出す. 閉じたら1週間は伏せる
  const [backupDismissed, dismissBackup] = useDismissed('backup', 7)
  const [storageDismissed, dismissStorage] = useDismissed('storage', 7)
  // 追加の案内は一度断られたら二度と出さない
  const [installDismissed, dismissInstall] = useDismissed('install')

  const status: BackupStatus = {
    lastBackupAt: settings.lastBackupAt,
    lastImportAt: settings.lastImportAt,
    latestUpdatedAt: timestamps.latestUpdatedAt,
    firstCreatedAt: timestamps.firstCreatedAt,
    now,
  }

  const showBackup = !backupDismissed && needsBackupReminder(status)
  const showStorage =
    !storageDismissed && usage !== null && isStorageTight(usage.usage, usage.quota)
  // 7日の消去の制約を受けるのは iOS でタブとして開いている場合だけ (specs.md §6.2)
  const showInstall = !installDismissed && isIos() && !isStandalone()

  if (!showBackup && !showStorage && !showInstall) return null

  return (
    <div className="notices">
      {showBackup && (
        <div className="notice-card notice-card--warn">
          <Icon name="import" size={18} className="icon--flip" />
          <div className="notice-card__body">
            <p className="notice-card__text">
              {daysSinceSynced(status)} 日ぶんの変更が、この端末にしかありません。
            </p>
            <p className="notice-card__sub">
              端末が壊れると取り戻せません。設定からバックアップを書き出してください。
            </p>
          </div>
          <div className="notice-card__actions">
            <Link className="btn btn--small btn--primary" to="/settings">
              開く
            </Link>
            <button type="button" className="btn btn--small" onClick={dismissBackup}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {showStorage && usage !== null && (
        <div className="notice-card notice-card--danger">
          <Icon name="image" size={18} />
          <div className="notice-card__body">
            <p className="notice-card__text">保存領域の残りが少なくなっています。</p>
            <p className="notice-card__sub">
              {formatBytes(usage.usage ?? 0)} / {formatBytes(usage.quota ?? 0)} を使用中です。
              画像の多いセットを整理するか、バックアップを取ってください。
            </p>
          </div>
          <div className="notice-card__actions">
            <Link className="btn btn--small btn--primary" to="/settings">
              開く
            </Link>
            <button type="button" className="btn btn--small" onClick={dismissStorage}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {showInstall && (
        <div className="notice-card">
          <Icon name="home" size={18} />
          <div className="notice-card__body">
            <p className="notice-card__text">ホーム画面に追加して使ってください。</p>
            <p className="notice-card__sub">
              Safari のタブのままだと、しばらく開かない間にデータが消えることがあります。
              共有ボタンから「ホーム画面に追加」を選んでください。
            </p>
          </div>
          <div className="notice-card__actions">
            <button type="button" className="btn btn--small" onClick={dismissInstall}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
