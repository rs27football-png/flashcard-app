import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder, StudySet } from '../../core/types'
import {
  countFolderContents,
  createFolder,
  deleteFolder,
  listChildFolders,
  listFolders,
  moveFolder,
  renameFolder,
  type FolderContents,
  type FolderDeleteMode,
} from '../../core/db/folders'
import { countCardsPerSet, createSet, listAllSets } from '../../core/db/sets'
import { FolderSelect } from '../components/FolderSelect'
import { Modal } from '../components/Modal'
import { useExpandedFolders } from '../hooks/useExpandedFolders'

/** 開いているダイアログ. 種類ごとに必要な値をまとめて持たせ, 取り違えを型で防ぐ */
type Dialog =
  | { type: 'none' }
  | { type: 'folderMenu'; folder: Folder }
  | { type: 'createFolder'; parentId: string | null }
  | { type: 'renameFolder'; folder: Folder }
  | { type: 'moveFolder'; folder: Folder }
  | { type: 'deleteFolder'; folder: Folder; contents: FolderContents }
  | { type: 'createSet'; folderId: string | null }

const CLOSED: Dialog = { type: 'none' }

/** S1 ホーム. フォルダツリーと学習セット一覧 ( specs.md §3 ) */
export function HomeScreen() {
  const navigate = useNavigate()
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const sets = useLiveQuery(() => listAllSets(), [], [] as StudySet[])
  const cardCounts = useLiveQuery(() => countCardsPerSet(), [], new Map<string, number>())
  const { expanded, toggle, expand } = useExpandedFolders()
  const [dialog, setDialog] = useState<Dialog>(CLOSED)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setDialog(CLOSED)
    setError(null)
  }

  const openDeleteFolder = async (folder: Folder) => {
    setDialog({
      type: 'deleteFolder',
      folder,
      contents: await countFolderContents(folder.id),
    })
  }

  const handleCreateFolder = async (name: string, parentId: string | null) => {
    await createFolder(name, parentId)
    // 作った下位フォルダがいきなり隠れていると分かりにくいため, 親を開いておく
    if (parentId !== null) expand(parentId)
    close()
  }

  const handleMoveFolder = async (folder: Folder, parentId: string | null) => {
    try {
      await moveFolder(folder.id, parentId)
      close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '移動に失敗しました.')
    }
  }

  const handleDeleteFolder = async (folder: Folder, mode: FolderDeleteMode) => {
    await deleteFolder(folder.id, mode)
    close()
  }

  const handleCreateSet = async (
    name: string,
    description: string,
    folderId: string | null,
  ) => {
    const created = await createSet({ name, description, folderId })
    close()
    navigate(`/sets/${created.id}`)
  }

  const rootFolders = listChildFolders(folders, null)
  const rootSets = sets
    .filter((set) => set.folderId === null)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const isEmpty = rootFolders.length === 0 && rootSets.length === 0

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">単語帳アプリ</h1>
        <div className="screen__actions">
          <Link className="btn" to="/import">
            テキストから取り込み
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => setDialog({ type: 'createFolder', parentId: null })}
          >
            + フォルダ
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDialog({ type: 'createSet', folderId: null })}
          >
            + 学習セット
          </button>
        </div>
      </header>

      <main>
        {isEmpty ? (
          <p className="empty">
            まだ何もありません. 「+ 学習セット」から最初のセットを作成してください.
          </p>
        ) : (
          <ul className="tree">
            {rootFolders.map((folder) => (
              <FolderNode
                key={folder.id}
                folder={folder}
                folders={folders}
                sets={sets}
                cardCounts={cardCounts}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                onMenu={(target) => setDialog({ type: 'folderMenu', folder: target })}
              />
            ))}
            {rootSets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                cardCount={cardCounts.get(set.id) ?? 0}
                depth={0}
              />
            ))}
          </ul>
        )}
      </main>

      <Modal
        open={dialog.type === 'folderMenu'}
        title={dialog.type === 'folderMenu' ? dialog.folder.name : ''}
        onClose={close}
      >
        {dialog.type === 'folderMenu' && (
          <div className="menu">
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'createSet', folderId: dialog.folder.id })}
            >
              このフォルダに学習セットを追加
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'createFolder', parentId: dialog.folder.id })}
            >
              このフォルダに下位フォルダを追加
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'renameFolder', folder: dialog.folder })}
            >
              名前を変更
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'moveFolder', folder: dialog.folder })}
            >
              別のフォルダへ移動
            </button>
            <button
              type="button"
              className="menu__item menu__item--danger"
              onClick={() => void openDeleteFolder(dialog.folder)}
            >
              削除
            </button>
          </div>
        )}
      </Modal>

      <Modal open={dialog.type === 'createFolder'} title="フォルダを追加" onClose={close}>
        {dialog.type === 'createFolder' && (
          <CreateFolderForm
            folders={folders}
            parentId={dialog.parentId}
            onSubmit={handleCreateFolder}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal
        open={dialog.type === 'renameFolder'}
        title="フォルダの名前を変更"
        onClose={close}
      >
        {dialog.type === 'renameFolder' && (
          <RenameFolderForm
            folder={dialog.folder}
            onSubmit={async (name) => {
              await renameFolder(dialog.folder.id, name)
              close()
            }}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal open={dialog.type === 'moveFolder'} title="フォルダを移動" onClose={close}>
        {dialog.type === 'moveFolder' && (
          <MoveFolderForm
            folders={folders}
            folder={dialog.folder}
            error={error}
            onSubmit={(parentId) => handleMoveFolder(dialog.folder, parentId)}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal open={dialog.type === 'deleteFolder'} title="フォルダを削除" onClose={close}>
        {dialog.type === 'deleteFolder' && (
          <DeleteFolderBody
            folder={dialog.folder}
            contents={dialog.contents}
            onDelete={(mode) => handleDeleteFolder(dialog.folder, mode)}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal open={dialog.type === 'createSet'} title="学習セットを追加" onClose={close}>
        {dialog.type === 'createSet' && (
          <CreateSetForm
            folders={folders}
            folderId={dialog.folderId}
            onSubmit={handleCreateSet}
            onCancel={close}
          />
        )}
      </Modal>
    </div>
  )
}

interface FolderNodeProps {
  folder: Folder
  folders: readonly Folder[]
  sets: readonly StudySet[]
  cardCounts: Map<string, number>
  depth: number
  expanded: Set<string>
  onToggle: (folderId: string) => void
  onMenu: (folder: Folder) => void
}

function FolderNode({
  folder,
  folders,
  sets,
  cardCounts,
  depth,
  expanded,
  onToggle,
  onMenu,
}: FolderNodeProps) {
  const isOpen = expanded.has(folder.id)
  const childFolders = listChildFolders(folders, folder.id)
  const childSets = sets
    .filter((set) => set.folderId === folder.id)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const isLeaf = childFolders.length === 0 && childSets.length === 0

  return (
    <li className="tree__node">
      <div className="row" style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}>
        <button
          type="button"
          className="row__twisty"
          onClick={() => onToggle(folder.id)}
          aria-expanded={isOpen}
          aria-label={isOpen ? '閉じる' : '開く'}
          disabled={isLeaf}
        >
          {isLeaf ? '·' : isOpen ? '▾' : '▸'}
        </button>
        <button type="button" className="row__main" onClick={() => onToggle(folder.id)}>
          <span className="row__icon" aria-hidden="true">
            📁
          </span>
          <span className="row__label">{folder.name}</span>
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${folder.name} の操作`}
          onClick={() => onMenu(folder)}
        >
          ⋯
        </button>
      </div>

      {isOpen && !isLeaf && (
        <ul className="tree">
          {childFolders.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              sets={sets}
              cardCounts={cardCounts}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onMenu={onMenu}
            />
          ))}
          {childSets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              cardCount={cardCounts.get(set.id) ?? 0}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function SetRow({
  set,
  cardCount,
  depth,
}: {
  set: StudySet
  cardCount: number
  depth: number
}) {
  return (
    <li className="tree__node">
      <div className="row" style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}>
        <span className="row__twisty" aria-hidden="true" />
        <Link to={`/sets/${set.id}`} className="row__main">
          <span className="row__icon" aria-hidden="true">
            🗂
          </span>
          <span className="row__label">{set.name}</span>
          <span className="row__meta">{cardCount} 枚</span>
        </Link>
      </div>
    </li>
  )
}

function CreateFolderForm({
  folders,
  parentId,
  onSubmit,
  onCancel,
}: {
  folders: readonly Folder[]
  parentId: string | null
  onSubmit: (name: string, parentId: string | null) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState<string | null>(parentId)

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        void onSubmit(name, parent)
      }}
    >
      <label className="field">
        <span className="field__label">フォルダ名</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span className="field__label">作成先</span>
        <FolderSelect folders={folders} value={parent} onChange={setParent} />
      </label>
      <FormActions submitLabel="作成" onCancel={onCancel} disabled={name.trim() === ''} />
    </form>
  )
}

function RenameFolderForm({
  folder,
  onSubmit,
  onCancel,
}: {
  folder: Folder
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(folder.name)

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        void onSubmit(name)
      }}
    >
      <label className="field">
        <span className="field__label">フォルダ名</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoFocus
          required
        />
      </label>
      <FormActions submitLabel="変更" onCancel={onCancel} disabled={name.trim() === ''} />
    </form>
  )
}

function MoveFolderForm({
  folders,
  folder,
  error,
  onSubmit,
  onCancel,
}: {
  folders: readonly Folder[]
  folder: Folder
  error: string | null
  onSubmit: (parentId: string | null) => Promise<void>
  onCancel: () => void
}) {
  const [parent, setParent] = useState<string | null>(folder.parentId)

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(parent)
      }}
    >
      <label className="field">
        <span className="field__label">移動先</span>
        {/* 自身とその配下は循環参照になるため, そもそも選択肢に出さない ( specs.md §4.1 ) */}
        <FolderSelect
          folders={folders}
          value={parent}
          onChange={setParent}
          excludeSubtreeOf={folder.id}
        />
      </label>
      {error !== null && <p className="alert">{error}</p>}
      <FormActions submitLabel="移動" onCancel={onCancel} />
    </form>
  )
}

function DeleteFolderBody({
  folder,
  contents,
  onDelete,
  onCancel,
}: {
  folder: Folder
  contents: FolderContents
  onDelete: (mode: FolderDeleteMode) => Promise<void>
  onCancel: () => void
}) {
  const total = contents.folderCount + contents.setCount
  const isEmpty = total === 0

  return (
    <div className="form">
      <p>
        「{folder.name}」を削除します。
        {isEmpty
          ? 'このフォルダは空です。'
          : `配下に下位フォルダ ${contents.folderCount} 件, 学習セット ${contents.setCount} 件 ( カード ${contents.cardCount} 枚 ) があります。`}
      </p>
      {isEmpty ? (
        <div className="form__actions">
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void onDelete('cascade')}
          >
            削除
          </button>
        </div>
      ) : (
        <div className="menu">
          <button type="button" className="menu__item" onClick={() => void onDelete('promote')}>
            配下をルートへ移動し, このフォルダのみ削除する
          </button>
          <button
            type="button"
            className="menu__item menu__item--danger"
            onClick={() => void onDelete('cascade')}
          >
            配下の {total} 件もまとめて削除する
          </button>
          <button type="button" className="menu__item" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}

function CreateSetForm({
  folders,
  folderId,
  onSubmit,
  onCancel,
}: {
  folders: readonly Folder[]
  folderId: string | null
  onSubmit: (name: string, description: string, folderId: string | null) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parent, setParent] = useState<string | null>(folderId)

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        void onSubmit(name, description, parent)
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
      <label className="field">
        <span className="field__label">説明 ( 任意 )</span>
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
        />
      </label>
      <label className="field">
        <span className="field__label">所属フォルダ</span>
        <FolderSelect folders={folders} value={parent} onChange={setParent} />
      </label>
      <FormActions submitLabel="作成" onCancel={onCancel} disabled={name.trim() === ''} />
    </form>
  )
}

function FormActions({
  submitLabel,
  onCancel,
  disabled,
}: {
  submitLabel: string
  onCancel: () => void
  disabled?: boolean
}) {
  return (
    <div className="form__actions">
      <button type="button" className="btn" onClick={onCancel}>
        キャンセル
      </button>
      <button type="submit" className="btn btn--primary" disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  )
}
