import { useId, useRef, useState } from 'react'
import type { Asset } from '../../core/types'
import type { ImageEdit } from '../../core/db/cards'
import {
  ACCEPTED_IMAGE_TYPES,
  compressImage,
  formatBytes,
  isImageFile,
} from '../../core/media/compress'
import { useBlobUrl } from '../hooks/useAssetUrls'
import { Icon } from './Icon'

interface ImageFieldProps {
  /** 「表面の画像」など */
  label: string
  /** 保存済みの画像。まだ付いていなければ null */
  current: Asset | null
  /**
   * 保存済み画像の一時 URL。
   * 画面全体で1つの控えから配る。ここで作り直すと, ライブクエリが更新されるたびに
   * 古い URL が解放され, 表示中の img が読めなくなる。
   */
  currentUrl: string | null
  edit: ImageEdit
  onChange: (edit: ImageEdit) => void
  /** 長辺の上限 (specs.md §2.8) */
  maxEdge: number
}

/**
 * カード1面ぶんの画像欄 (specs.md §4.4.2)。
 *
 * ファイル選択・貼り付け・ドロップの3経路を受ける。取り込んだ時点で必ず圧縮し,
 * 前後の大きさを並べて示す。書き込みはカードの保存に合わせるため, ここでは持つだけにする。
 */
export function ImageField({
  label,
  current,
  currentUrl,
  edit,
  onChange,
  maxEdge,
}: ImageFieldProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const pending = edit.kind === 'set' ? edit.image : null
  const kept = edit.kind === 'keep' ? current : null
  // 取り込んだばかりの画像はまだ控えにないため, ここで URL を作る。
  // 状態として持っている Blob なので, 作り直しは差し替えたときだけになる
  const pendingUrl = useBlobUrl(pending?.blob ?? null)
  const previewUrl = pendingUrl ?? (kept === null ? null : currentUrl)

  const take = async (file: File | null | undefined) => {
    if (!isImageFile(file)) {
      setError('画像ファイルを選んでください。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onChange({ kind: 'set', image: await compressImage(file, maxEdge) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '画像を取り込めませんでした。')
    } finally {
      setBusy(false)
      // 同じファイルをもう一度選べるよう, 選択状態を空に戻す
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div
        className={`image-field ${dragging ? 'image-field--over' : ''}`}
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void take(event.dataTransfer.files[0])
        }}
        onPaste={(event) => {
          const file = event.clipboardData.files[0]
          if (!isImageFile(file)) return
          event.preventDefault()
          void take(file)
        }}
      >
        {previewUrl !== null ? (
          <img className="image-field__preview" src={previewUrl} alt={`${label}のプレビュー`} />
        ) : (
          <p className="image-field__empty">
            {busy ? '取り込み中…' : '画像なし'}
            <span className="note">選ぶ / 貼り付け / ドロップ</span>
          </p>
        )}

        <div className="image-field__actions">
          <input
            id={inputId}
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            onChange={(event) => void take(event.target.files?.[0])}
          />
          {/* iPhone ではこの選択でカメラとフォトライブラリのどちらも選べる */}
          <label className="btn btn--small" htmlFor={inputId}>
            <Icon name="image" size={15} />
            {previewUrl === null ? '画像を選ぶ' : '差し替える'}
          </label>
          {previewUrl !== null && (
            <button
              type="button"
              className="btn btn--small btn--danger"
              disabled={busy}
              onClick={() => onChange({ kind: 'remove' })}
            >
              <Icon name="trash" size={15} />
              取り外す
            </button>
          )}
          {edit.kind === 'remove' && current !== null && (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => onChange({ kind: 'keep' })}
            >
              <Icon name="undo" size={15} />
              戻す
            </button>
          )}
        </div>

        {pending !== null && (
          <p className="note image-field__size">
            {pending.width}×{pending.height} / {formatBytes(pending.originalBytes)} →{' '}
            {formatBytes(pending.bytes)} ({pending.mimeType === 'image/webp' ? 'WebP' : 'JPEG'})
          </p>
        )}
        {kept !== null && (
          <p className="note image-field__size">
            {kept.width}×{kept.height} / {formatBytes(kept.bytes)}
          </p>
        )}
        {edit.kind === 'remove' && current !== null && (
          <p className="note image-field__size">保存すると画像が外れます。</p>
        )}
        {error !== null && <p className="alert">{error}</p>}
      </div>
    </div>
  )
}
