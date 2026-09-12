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
import { countCardsPerSet, createSet, listAllSets, moveSet } from '../../core/db/sets'
import { copyFolder } from '../../core/db/setOps'
import { FolderSelect } from '../components/FolderSelect'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { SetActions } from '../components/SetActions'
import { useExpandedFolders } from '../hooks/useExpandedFolders'
import { DROP_ATTRIBUTE, ROOT_DROP_VALUE, useSetDrag } from '../hooks/useSetDrag'

/** 開いているダイアログ. 種類ごとに必要な値をまとめて持たせ, 取り違えを型で防ぐ */
type Dialog =
  | { type: 'none' }
  | { type: 'folderMenu'; folder: Folder }
  | { type: 'createFolder'; parentId: string | null }
  | { type: 'renameFolder'; folder: Folder }
  | { type: 'moveFolder'; folder: Folder }
  | { type: 'deleteFolder'; folder: Folder; contents: FolderContents }
  | { type: 'createSet'; folderId: string | null }
  | { type: 'setActions'; set: StudySet }

const CLOSED: Dialog = { type: 'none' }

/** S1 ホーム. フォルダツリーと学習セット一覧 (specs.md §3) */
export function HomeScreen() {
  const navigate = useNavigate()
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const sets = useLiveQuery(() => listAllSets(), [], [] as StudySet[])
  const cardCounts = useLiveQuery(() => countCardsPerSet(), [], new Map<string, number>())
  const { expanded, toggle, expand } = useExpandedFolders()
  const [dialog, setDialog] = useState<Dialog>(CLOSED)
  const [error, setError] = useState<string | null>(null)
  const { drag, start: startDrag } = useSetDrag((setId, folderId) => {
    void moveSet(setId, folderId)
    // 落とし先が閉じたままだと移動先が見えないので開いておく
    if (folderId !== null) expand(folderId)
  })

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
      setError(cause instanceof Error ? cause.message : '移動に失敗しました。')
    }
  }

  const handleCopyFolder = async (folder: Folder) => {
    await copyFolder(folder.id)
    // 複製は元と同じ階層に並ぶ. 親が閉じていると見えないため開いておく
    if (folder.parentId !== null) expand(folder.parentId)
    close()
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
            <Icon name="import" />
            インポート
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => setDialog({ type: 'createFolder', parentId: null })}
          >
            <Icon name="folder-plus" />
            フォルダ
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDialog({ type: 'createSet', folderId: null })}
          >
            <Icon name="set-plus" />
            学習セット
          </button>
        </div>
      </header>

      {/* 検索への入口 (specs.md §3 S1, §4.10) */}
      <Link to="/search" className="search-entry">
        <Icon name="search" />
        用語・定義・セット名を検索
      </Link>

      {/* 外側をまるごと根の落下先にする. 内側のフォルダの節が優先して拾われる */}
      <main
        {...{ [DROP_ATTRIBUTE]: ROOT_DROP_VALUE }}
        className={`tree-root ${drag !== null && drag.overFolderId === null ? 'tree-root--over' : ''}`}
      >
        {isEmpty ? (
          <p className="empty">
            まだ何もありません。「学習セット」から最初のセットを作成してください。
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
                dragOverFolderId={drag?.overFolderId}
                draggingSetId={drag?.setId ?? null}
                onToggle={toggle}
                onMenu={(target) => setDialog({ type: 'folderMenu', folder: target })}
                onAddSet={(folderId) => setDialog({ type: 'createSet', folderId })}
                onAddFolder={(parentId) => setDialog({ type: 'createFolder', parentId })}
                onGrip={startDrag}
                onSetMenu={(target) => setDialog({ type: 'setActions', set: target })}
              />
            ))}
            {rootSets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                cardCount={cardCounts.get(set.id) ?? 0}
                depth={0}
                dragging={drag?.setId === set.id}
                onGrip={startDrag}
                onMenu={(target) => setDialog({ type: 'setActions', set: target })}
              />
            ))}
          </ul>
        )}
      </main>

      {drag !== null && (
        <>
          {/*
            ルートへ戻す落下先。フォルダの節は配下の余白まで覆うため、ツリーの下端に
            落としてもフォルダに入ってしまう。画面上端に固定した帯を別に用意する。
            固定配置にしているのは、ドラッグの最中に行がずれないようにするため。
          */}
          <div
            {...{ [DROP_ATTRIBUTE]: ROOT_DROP_VALUE }}
            className={`drop-root ${drag.overFolderId === null ? 'drop-root--over' : ''}`}
          >
            <Icon name="folder" />
            ここへ落とすとルート (最上位) へ移動
          </div>
          {/* 掴んでいるものを指の先に見せる. 下の要素を拾えるよう pointer-events は無効 */}
          <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
            <Icon name="set" />
            {drag.label}
          </div>
        </>
      )}

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
              <Icon name="set-plus" />
              このフォルダに学習セットを追加
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'createFolder', parentId: dialog.folder.id })}
            >
              <Icon name="folder-plus" />
              このフォルダに下位フォルダを追加
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'renameFolder', folder: dialog.folder })}
            >
              <Icon name="edit" />
              名前を変更
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => setDialog({ type: 'moveFolder', folder: dialog.folder })}
            >
              <Icon name="folder" />
              別のフォルダへ移動
            </button>
            <button
              type="button"
              className="menu__item"
              onClick={() => void handleCopyFolder(dialog.folder)}
            >
              <Icon name="copy" />
              フォルダをコピー (中身ごと)
            </button>
            <button
              type="button"
              className="menu__item menu__item--danger"
              onClick={() => void openDeleteFolder(dialog.folder)}
            >
              <Icon name="trash" />
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

      {dialog.type === 'setActions' && (
        <SetActions
          set={dialog.set}
          folders={folders}
          onClose={close}
          onCopied={(_, folderId) => {
            // ホームからのコピーはその場に留まり、置いた先を開いて見せる
            if (folderId !== null) expand(folderId)
            close()
          }}
          onDeleted={close}
        />
      )}
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
  /** ドラッグ中の落下先. null は根, undefined は落下先の外 */
  dragOverFolderId: string | null | undefined
  draggingSetId: string | null
  onToggle: (folderId: string) => void
  onMenu: (folder: Folder) => void
  onAddSet: (folderId: string) => void
  onAddFolder: (parentId: string) => void
  onGrip: (event: React.PointerEvent, setId: string, label: string) => void
  /** 学習セットの行の ⋯ (specs.md §4.9) */
  onSetMenu: (set: StudySet) => void
}

function FolderNode({
  folder,
  folders,
  sets,
  cardCounts,
  depth,
  expanded,
  dragOverFolderId,
  draggingSetId,
  onToggle,
  onMenu,
  onAddSet,
  onAddFolder,
  onGrip,
  onSetMenu,
}: FolderNodeProps) {
  const isOpen = expanded.has(folder.id)
  const childFolders = listChildFolders(folders, folder.id)
  const childSets = sets
    .filter((set) => set.folderId === folder.id)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const isLeaf = childFolders.length === 0 && childSets.length === 0
  const isDropTarget = dragOverFolderId === folder.id

  return (
    // 節ごと落下先にする. 配下のどこへ落としてもこのフォルダに入る.
    // 入れ子のフォルダでは内側の節が先に拾われる.
    <li className="tree__node" {...{ [DROP_ATTRIBUTE]: folder.id }}>
      <div
        className={`row ${isDropTarget ? 'row--drop' : ''}`}
        style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}
      >
        <button
          type="button"
          className="row__twisty"
          onClick={() => onToggle(folder.id)}
          aria-expanded={isOpen}
          aria-label={isOpen ? '閉じる' : '開く'}
          disabled={isLeaf}
        >
          {isLeaf ? (
            <span className="row__twisty-dot" aria-hidden="true" />
          ) : (
            <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} />
          )}
        </button>
        <button type="button" className="row__main" onClick={() => onToggle(folder.id)}>
          <Icon name="folder" className="icon--folder" />
          <span className="row__label">{folder.name}</span>
        </button>
        {/* VS Code のように行へ直接「追加」を置く. 目的のフォルダを選び直す手間を省く */}
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${folder.name} に学習セットを追加`}
          title="学習セットを追加"
          onClick={() => onAddSet(folder.id)}
        >
          <Icon name="set-plus" size={17} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${folder.name} に下位フォルダを追加`}
          title="下位フォルダを追加"
          onClick={() => onAddFolder(folder.id)}
        >
          <Icon name="folder-plus" size={17} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${folder.name} の操作`}
          onClick={() => onMenu(folder)}
        >
          <Icon name="more" size={17} />
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
              dragOverFolderId={dragOverFolderId}
              draggingSetId={draggingSetId}
              onToggle={onToggle}
              onMenu={onMenu}
              onAddSet={onAddSet}
              onAddFolder={onAddFolder}
              onGrip={onGrip}
              onSetMenu={onSetMenu}
            />
          ))}
          {childSets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              cardCount={cardCounts.get(set.id) ?? 0}
              depth={depth + 1}
              dragging={draggingSetId === set.id}
              onGrip={onGrip}
              onMenu={onSetMenu}
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
  dragging,
  onGrip,
  onMenu,
}: {
  set: StudySet
  cardCount: number
  depth: number
  dragging: boolean
  onGrip: (event: React.PointerEvent, setId: string, label: string) => void
  onMenu: (set: StudySet) => void
}) {
  return (
    <li className="tree__node">
      <div
        className={`row ${dragging ? 'row--dragging' : ''}`}
        style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}
      >
        {/* つまみだけを掴めるようにして, 一覧の縦スクロールと競合させない */}
        <button
          type="button"
          className="row__grip"
          aria-label={`${set.name} を掴んで移動`}
          title="ドラッグしてフォルダへ移動"
          onPointerDown={(event) => onGrip(event, set.id, set.name)}
        >
          <Icon name="grip" size={16} />
        </button>
        <Link to={`/sets/${set.id}`} className="row__main">
          <Icon name="set" className="icon--set" />
          <span className="row__label">{set.name}</span>
          <span className="row__meta">{cardCount} 枚</span>
        </Link>
        {/* 詳細を開かずにコピー・統合・分割できるようにする (specs.md §4.9) */}
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${set.name} の操作`}
          onClick={() => onMenu(set)}
        >
          <Icon name="more" size={17} />
        </button>
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
        {/* 自身とその配下は循環参照になるため, そもそも選択肢に出さない (specs.md §4.1) */}
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
          : `配下に下位フォルダ ${contents.folderCount} 件、学習セット ${contents.setCount} 件 (カード ${contents.cardCount} 枚) があります。`}
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
            配下をルートへ移動し、このフォルダのみ削除する
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
        <span className="field__label">説明 (任意)</span>
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
