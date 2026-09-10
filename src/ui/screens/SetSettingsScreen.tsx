import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder, StudySet } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import { countCardsInSet, deleteSet, getSet, updateSet } from '../../core/db/sets'
import { Breadcrumb } from '../components/Breadcrumb'
import { FolderSelect } from '../components/FolderSelect'
import { Modal } from '../components/Modal'

/** S10 セット設定. 名称・説明・所属フォルダ ( specs.md §3, §4.2 ) */
export function SetSettingsScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const set = useLiveQuery(async () => (await getSet(setId)) ?? null, [setId])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])

  if (set === undefined) return <p className="empty">読み込み中…</p>
  if (set === null) {
    return (
      <div className="screen">
        <p className="empty">この学習セットは見つかりませんでした.</p>
        <Link className="btn" to="/">
          ホームへ戻る
        </Link>
      </div>
    )
  }

  // key を渡して, セットが切り替わったときに入力欄の状態を作り直す
  return <SetSettingsForm key={set.id} set={set} folders={folders} />
}

function SetSettingsForm({ set, folders }: { set: StudySet; folders: readonly Folder[] }) {
  const navigate = useNavigate()
  const [name, setName] = useState(set.name)
  const [description, setDescription] = useState(set.description)
  const [folderId, setFolderId] = useState<string | null>(set.folderId)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const cardCount = useLiveQuery(() => countCardsInSet(set.id), [set.id], 0)

  const save = async () => {
    await updateSet(set.id, { name, description, folderId })
    setSaved(true)
  }

  const remove = async () => {
    await deleteSet(set.id)
    navigate('/', { replace: true })
  }

  return (
    <div className="screen">
      <Breadcrumb folders={folders} folderId={set.folderId} current={set.name} />

      <header className="screen__head">
        <h1 className="screen__title">セット設定</h1>
        <div className="screen__actions">
          <Link className="btn" to={`/sets/${set.id}`}>
            セット詳細へ戻る
          </Link>
        </div>
      </header>

      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span className="field__label">セット名</span>
          <input
            className="input"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSaved(false)
            }}
            maxLength={100}
            required
          />
        </label>

        <label className="field">
          <span className="field__label">説明 ( 任意 )</span>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              setSaved(false)
            }}
            maxLength={500}
          />
        </label>

        <label className="field">
          <span className="field__label">所属フォルダ</span>
          <FolderSelect
            folders={folders}
            value={folderId}
            onChange={(value) => {
              setFolderId(value)
              setSaved(false)
            }}
          />
        </label>

        <div className="form__actions">
          {saved && <span className="saved">保存しました</span>}
          <button type="submit" className="btn btn--primary" disabled={name.trim() === ''}>
            保存
          </button>
        </div>
      </form>

      <section className="section">
        <h2 className="section__title">リッチコンテンツ</h2>
        <p className="note">
          画像と数式の有効化は段階6で追加します ( specs.md §4.4 ).
        </p>
      </section>

      <section className="section section--danger">
        <h2 className="section__title">このセットを削除</h2>
        <p className="note">配下のカードと進捗も一緒に削除されます. 元に戻せません.</p>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => setConfirmingDelete(true)}
        >
          セットを削除
        </button>
      </section>

      <Modal
        open={confirmingDelete}
        title="学習セットを削除"
        onClose={() => setConfirmingDelete(false)}
      >
        <div className="form">
          <p>
            「{set.name}」を削除します。カード {cardCount} 枚と, その進捗も一緒に削除されます。
          </p>
          <div className="form__actions">
            <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
              キャンセル
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void remove()}>
              削除
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
