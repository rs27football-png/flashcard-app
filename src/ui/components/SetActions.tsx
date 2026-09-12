import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder, StudySet } from '../../core/types'
import { countCardsInSet, deleteSet, moveSet, renameSet } from '../../core/db/sets'
import { copySet } from '../../core/db/setOps'
import { FolderSelect } from './FolderSelect'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { Toggle } from './Toggle'

type Stage = 'menu' | 'rename' | 'move' | 'copy' | 'delete'

const TITLES: Record<Stage, string> = {
  menu: '',
  rename: '名前を変更',
  move: '別のフォルダへ移動',
  copy: 'セットをコピー',
  delete: '学習セットを削除',
}

interface SetActionsProps {
  set: StudySet
  folders: readonly Folder[]
  onClose: () => void
  /** コピーを作ったあと。呼び出し側が行き先を決められるよう、置いたフォルダも返す */
  onCopied: (newSetId: string, folderId: string | null) => void
  /** 削除したあと */
  onDeleted: () => void
}

/**
 * 学習セットの操作 (specs.md §4.2, §4.9)。
 *
 * セット詳細の ⋯ とホームの学習セットの行の ⋯ で共用する。フォルダの ⋯ と同じ並びに揃え、
 * 名前の変更・移動・削除もここから行えるようにしてある。
 * 開くときに描画し、閉じたら外す前提。
 */
export function SetActions({ set, folders, onClose, onCopied, onDeleted }: SetActionsProps) {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('menu')
  const [name, setName] = useState(set.name)
  const [folderId, setFolderId] = useState<string | null>(set.folderId)
  const [copyName, setCopyName] = useState(`${set.name} のコピー`)
  const [copyFolderId, setCopyFolderId] = useState<string | null>(set.folderId)
  const [keepProgress, setKeepProgress] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardCount = useLiveQuery(() => countCardsInSet(set.id), [set.id], 0)

  /** 失敗したときはダイアログを閉じずに理由を出す */
  const run = async (task: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作に失敗しました。')
      setBusy(false)
    }
  }

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <Modal
      open
      title={stage === 'menu' ? set.name : TITLES[stage]}
      variant={stage === 'menu' ? 'sheet' : 'center'}
      onClose={onClose}
    >
      {stage === 'menu' && (
        <div className="menu">
          <button type="button" className="menu__item" onClick={() => setStage('rename')}>
            <Icon name="edit" />
            名前を変更
          </button>
          <button type="button" className="menu__item" onClick={() => setStage('move')}>
            <Icon name="folder" />
            別のフォルダへ移動
          </button>
          <button type="button" className="menu__item" onClick={() => setStage('copy')}>
            <Icon name="copy" />
            セットをコピー
          </button>
          <button type="button" className="menu__item" onClick={() => go(`/sets/${set.id}/merge`)}>
            <Icon name="merge" />
            他のセットと統合
          </button>
          <button type="button" className="menu__item" onClick={() => go(`/sets/${set.id}/split`)}>
            <Icon name="split" />
            セットを分割
          </button>
          <button
            type="button"
            className="menu__item menu__item--danger"
            onClick={() => setStage('delete')}
          >
            <Icon name="trash" />
            削除
          </button>
        </div>
      )}

      {stage === 'rename' && (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await renameSet(set.id, name)
              onClose()
            })
          }}
        >
          <label className="field">
            <span className="field__label">セット名</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoFocus
              required
            />
          </label>
          {error !== null && <p className="alert">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy || name.trim() === ''}>
              変更
            </button>
          </div>
        </form>
      )}

      {stage === 'move' && (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await moveSet(set.id, folderId)
              onClose()
            })
          }}
        >
          <label className="field">
            <span className="field__label">移動先</span>
            <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
          </label>
          {error !== null && <p className="alert">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              移動
            </button>
          </div>
        </form>
      )}

      {stage === 'copy' && (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              const newSetId = await copySet(set.id, {
                name: copyName,
                folderId: copyFolderId,
                keepProgress,
              })
              onCopied(newSetId, copyFolderId)
            })
          }}
        >
          <label className="field">
            <span className="field__label">コピーの名前</span>
            <input
              className="input"
              value={copyName}
              onChange={(event) => setCopyName(event.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">コピー先のフォルダ</span>
            <FolderSelect folders={folders} value={copyFolderId} onChange={setCopyFolderId} />
          </label>
          <Toggle
            label="進捗も引き継ぐ"
            description="オフなら全カードを未学習から始める"
            checked={keepProgress}
            onChange={setKeepProgress}
          />
          <p className="note">★とリッチコンテンツの設定は引き継ぎます。</p>
          {error !== null && <p className="alert">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || copyName.trim() === ''}
            >
              コピー
            </button>
          </div>
        </form>
      )}

      {stage === 'delete' && (
        <div className="form">
          <p>
            「{set.name}」を削除します。カード {cardCount} 枚と、その進捗も一緒に削除されます。
          </p>
          {error !== null && <p className="alert">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await deleteSet(set.id)
                  onDeleted()
                })
              }
            >
              削除
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
