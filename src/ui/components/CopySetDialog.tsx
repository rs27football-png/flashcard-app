import { useState } from 'react'
import type { Folder, StudySet } from '../../core/types'
import { copySet } from '../../core/db/setOps'
import { FolderSelect } from './FolderSelect'
import { Modal } from './Modal'
import { Toggle } from './Toggle'

interface CopySetDialogProps {
  set: StudySet
  folders: readonly Folder[]
  onClose: () => void
  /** コピーを作ったあとに呼ぶ. 呼び出し側が移動先を決められるよう, 置いたフォルダも返す */
  onCopied: (newSetId: string, folderId: string | null) => void
}

/**
 * 学習セットのコピー ( specs.md §4.9.1 ).
 * 開くたびに描画し直す前提で, 入力値は内部で持つ.
 */
export function CopySetDialog({ set, folders, onClose, onCopied }: CopySetDialogProps) {
  // 名称の既定値は「( 元の名称 ) のコピー」
  const [name, setName] = useState(`${set.name} のコピー`)
  const [folderId, setFolderId] = useState<string | null>(set.folderId)
  // 進捗は既定で引き継がない
  const [keepProgress, setKeepProgress] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (name.trim() === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const newSetId = await copySet(set.id, { name, folderId, keepProgress })
      onCopied(newSetId, folderId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'コピーに失敗しました.')
      setBusy(false)
    }
  }

  return (
    <Modal open title="セットをコピー" onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="field">
          <span className="field__label">コピーの名前</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">コピー先のフォルダ</span>
          <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
        </label>
        <Toggle
          label="進捗も引き継ぐ"
          description="オフなら全カードを未学習から始める"
          checked={keepProgress}
          onChange={setKeepProgress}
        />
        <p className="note">★とリッチコンテンツの設定は引き継ぎます.</p>
        {error !== null && <p className="alert">{error}</p>}
        <div className="form__actions">
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || name.trim() === ''}>
            コピー
          </button>
        </div>
      </form>
    </Modal>
  )
}
