import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { AppSettings } from '../../core/types'
import { getStorageUsage, type StorageUsage } from '../../core/db/assets'
import { DEFAULT_APP_SETTINGS, getAppSettings, markBackedUp, updateAppSettings } from '../../core/db/settings'
import { exportBackup } from '../../core/backup/exportBackup'
import { importBackup, readBackupFile, summarize, type ImportMode } from '../../core/backup/importBackup'
import { saveFile } from '../../core/backup/saveFile'
import type { BackupContent, ImportSummary } from '../../core/backup/format'
import { formatBytes } from '../../core/media/compress'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { Toggle } from '../components/Toggle'
import { useGoBack } from '../hooks/useGoBack'

const EMPTY_USAGE: StorageUsage = {
  assetBytes: 0,
  assetCount: 0,
  usage: null,
  quota: null,
  perSet: [],
}

const THEMES: { value: AppSettings['theme']; label: string }[] = [
  { value: 'system', label: '端末に合わせる' },
  { value: 'dark', label: 'ダーク' },
  { value: 'light', label: 'ライト' },
]

/** 長辺の上限の候補. 数字だけでは分かりにくいため用途を添える (specs.md §2.8) */
const MAX_EDGES = [
  { value: 1200, label: '1200px (軽い)' },
  { value: 1600, label: '1600px (標準)' },
  { value: 2000, label: '2000px (細かい図表向け)' },
  { value: 2400, label: '2400px (最も大きい)' },
]

function formatDateTime(at: number | null): string {
  if (at === null) return 'まだ書き出していません'
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** S9 設定. テーマ, バックアップ, 使用容量 (specs.md §3, §4.12) */
export function SettingsScreen() {
  const goBack = useGoBack()
  const settings = useLiveQuery(() => getAppSettings(), [], DEFAULT_APP_SETTINGS)
  const usage = useLiveQuery(() => getStorageUsage(), [], EMPTY_USAGE)

  const [includeImages, setIncludeImages] = useState(true)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 読み込んだファイルの中身. 取り込み方式を選ぶまで持っておく */
  const [pending, setPending] = useState<BackupContent | null>(null)
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = (patch: Partial<Omit<AppSettings, 'id'>>) => void updateAppSettings(patch)

  const runExport = async () => {
    setBusy('export')
    setError(null)
    setNotice(null)
    try {
      const file = await exportBackup(includeImages)
      const how = await saveFile(file.name, file.blob)
      if (how === 'cancelled') {
        setNotice('書き出しを取りやめました。')
      } else {
        await markBackedUp()
        setNotice(
          `${file.name} を書き出しました (セット ${file.counts.sets} 件, カード ${file.counts.cards} 枚` +
            `${includeImages ? `, 画像 ${file.counts.assets} 枚` : ''})。`,
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '書き出しに失敗しました。')
    } finally {
      setBusy(null)
    }
  }

  const pickFile = async (file: File | null | undefined) => {
    if (file === null || file === undefined) return
    setError(null)
    setNotice(null)
    setResult(null)
    try {
      setPending(await readBackupFile(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ファイルを読み取れませんでした。')
    } finally {
      // 同じファイルをもう一度選べるように戻す
      if (fileRef.current !== null) fileRef.current.value = ''
    }
  }

  const runImport = async (mode: ImportMode) => {
    if (pending === null) return
    setBusy('import')
    setError(null)
    try {
      const summary = await importBackup(pending, mode)
      setResult(summary)
      setPending(null)
      setConfirmingReplace(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取り込みに失敗しました。')
    } finally {
      setBusy(null)
    }
  }

  const preview = pending === null ? null : summarize(pending)

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">設定</h1>
        <div className="screen__actions">
          <button type="button" className="btn" onClick={goBack}>
            戻る
          </button>
        </div>
      </header>

      <section className="section">
        <h2 className="section__title">表示</h2>
        <div className="field">
          <span className="field__label">テーマ</span>
          <div className="segmented" role="group" aria-label="テーマ">
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                type="button"
                className={`segmented__item ${settings.theme === theme.value ? 'segmented__item--on' : ''}`}
                aria-pressed={settings.theme === theme.value}
                onClick={() => save({ theme: theme.value })}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="ショートカットキーの案内を出す"
          description="暗記モードと4択モードの下部に、キー操作の一覧を表示します。"
          checked={settings.showShortcutHints}
          onChange={(next) => save({ showShortcutHints: next })}
        />
      </section>

      <section className="section">
        <h2 className="section__title">学習</h2>
        <Toggle
          label="4択の結果を進捗に反映する"
          description="オフにすると、4択モードで答えても習得状況は変わりません。"
          checked={settings.quizAffectsProgress}
          onChange={(next) => save({ quizAffectsProgress: next })}
        />
      </section>

      <section className="section">
        <h2 className="section__title">画像</h2>
        <label className="field">
          <span className="field__label">取り込むときの長辺の上限</span>
          <select
            className="input"
            value={settings.imageMaxEdge}
            onChange={(event) => save({ imageMaxEdge: Number(event.target.value) })}
          >
            {MAX_EDGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="note">
          大きくすると細部まで残りますが、1枚あたりの容量も増えます。すでに取り込んだ画像には影響しません。
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">バックアップ</h2>
        <p className="note">最後に書き出した日時: {formatDateTime(settings.lastBackupAt)}</p>

        <Toggle
          label="画像を含める"
          description="含めると ZIP、含めないと JSON で書き出します。"
          checked={includeImages}
          onChange={setIncludeImages}
        />
        <div className="form__actions form__actions--stack">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy !== null}
            onClick={() => void runExport()}
          >
            <Icon name="import" size={16} className="icon--flip" />
            {busy === 'export' ? '書き出し中…' : '書き出す'}
          </button>
          {/* iOS では共有シートが開き, ファイルアプリや OneDrive へ送れる */}
          <label className="btn" aria-disabled={busy !== null}>
            <Icon name="import" size={16} />
            ファイルから取り込む
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept=".zip,.json,application/zip,application/json"
              disabled={busy !== null}
              onChange={(event) => void pickFile(event.target.files?.[0])}
            />
          </label>
        </div>

        {notice !== null && (
          <p className="save-note">
            <Icon name="check" size={16} />
            {notice}
          </p>
        )}
        {error !== null && <p className="alert">{error}</p>}

        {result !== null && (
          <div className="section section--inset">
            <p className="save-note">
              <Icon name="check" size={16} />
              取り込みました。
            </p>
            <ul className="usage">
              <li className="usage__item">フォルダ {result.folders} 件</li>
              <li className="usage__item">学習セット {result.sets} 件</li>
              <li className="usage__item">カード {result.cards} 枚</li>
              <li className="usage__item">画像 {result.assets} 枚</li>
            </ul>
            {result.cardsMissingImages > 0 && (
              <p className="note">
                画像を含まないファイルだったため、{result.cardsMissingImages}{' '}
                枚のカードは画像なしとして取り込みました。
              </p>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section__title">使用容量</h2>
        <ul className="usage">
          <li className="usage__item">
            <Icon name="image" size={16} />
            画像 {usage.assetCount} 枚 ({formatBytes(usage.assetBytes)})
          </li>
          {usage.usage !== null && (
            <li className="usage__item">
              <Icon name="set" size={16} />
              このアプリの使用量 {formatBytes(usage.usage)}
              {usage.quota !== null && ` / 割当 ${formatBytes(usage.quota)}`}
            </li>
          )}
        </ul>
        {usage.perSet.length > 0 && (
          <>
            <h3 className="section__subtitle">セットごとの画像</h3>
            <ul className="usage">
              {usage.perSet.map((row) => (
                <li key={row.setId} className="usage__row">
                  <span className="usage__name">{row.name}</span>
                  <span className="usage__value">
                    {row.count} 枚 / {formatBytes(row.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {usage.usage === null && (
          <p className="note">この端末では全体の使用量を取得できないため、画像の合計のみを示します。</p>
        )}
      </section>

      {/* 取り込み方式の選択 (specs.md §4.11) */}
      <Modal
        open={pending !== null && !confirmingReplace}
        title="取り込み方法を選ぶ"
        onClose={() => setPending(null)}
      >
        {preview !== null && (
          <div className="form">
            <p className="note">
              {formatDateTime(preview.exportedAt)} に書き出されたファイルです。フォルダ{' '}
              {preview.folders} 件、学習セット {preview.sets} 件、カード {preview.cards} 枚、画像{' '}
              {preview.withImages} 枚。
            </p>
            {preview.assets > preview.withImages && (
              <p className="note">
                画像の実体が入っていないものが {preview.assets - preview.withImages}{' '}
                枚あります。該当するカードは画像なしになります。
              </p>
            )}
            <div className="form__actions form__actions--stack">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy !== null}
                onClick={() => void runImport('merge')}
              >
                <Icon name="merge" size={16} />
                今のデータに追加する
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy !== null}
                onClick={() => setConfirmingReplace(true)}
              >
                <Icon name="refresh" size={16} />
                今のデータを置き換える
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 置き換えは元に戻せないため, 確認を必須とする (specs.md §4.11) */}
      <Modal
        open={confirmingReplace}
        title="今のデータを置き換える"
        onClose={() => setConfirmingReplace(false)}
      >
        <div className="form">
          <p>
            この端末にある<strong>フォルダ・学習セット・カード・画像・進捗をすべて削除</strong>
            してから、ファイルの中身を復元します。元に戻すことはできません。
          </p>
          <p className="note">
            心配な場合は、先に「書き出す」で今のデータを保存してから実行してください。
          </p>
          {error !== null && <p className="alert">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn" onClick={() => setConfirmingReplace(false)}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy !== null}
              onClick={() => void runImport('replace')}
            >
              {busy === 'import' ? '取り込み中…' : '置き換える'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
