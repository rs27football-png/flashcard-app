import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import {
  createCard,
  deleteCard,
  listCards,
  moveCard,
  setStarred,
  sortCards,
  updateCard,
  type CardInput,
} from '../../core/db/cards'
import { getSet } from '../../core/db/sets'
import { Breadcrumb } from '../components/Breadcrumb'
import { Modal } from '../components/Modal'

const EMPTY_INPUT: CardInput = { term: '', definition: '', hint: '' }

/** S3 カード編集. 追加 / 更新 / 削除 / 並べ替え ( specs.md §3, §4.3 ) */
export function CardEditScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const set = useLiveQuery(async () => (await getSet(setId)) ?? null, [setId])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const cards = useLiveQuery(() => listCards(setId), [setId], [] as Card[])

  const [input, setInput] = useState<CardInput>(EMPTY_INPUT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Card | null>(null)
  const termRef = useRef<HTMLTextAreaElement>(null)

  const isBlank = input.term.trim() === '' && input.definition.trim() === ''

  const resetForm = () => {
    setInput(EMPTY_INPUT)
    setEditingId(null)
    setError(null)
  }

  const submit = async () => {
    if (isBlank) return
    try {
      if (editingId === null) {
        await createCard(setId, input)
      } else {
        await updateCard(editingId, input)
      }
      resetForm()
      // 連続追加を想定し, 保存後は入力欄をクリアして同じ画面に留まる ( specs.md §4.3 )
      termRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存に失敗しました.')
    }
  }

  const startEdit = (card: Card) => {
    setEditingId(card.id)
    setInput({ term: card.term, definition: card.definition, hint: card.hint })
    setError(null)
    termRef.current?.focus()
  }

  const confirmDelete = async (card: Card) => {
    await deleteCard(card.id)
    if (editingId === card.id) resetForm()
    setPendingDelete(null)
  }

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

  return (
    <div className="screen">
      <Breadcrumb folders={folders} folderId={set.folderId} current={set.name} />

      <header className="screen__head">
        <h1 className="screen__title">カードを編集</h1>
        <div className="screen__actions">
          <Link className="btn" to={`/sets/${set.id}`}>
            セット詳細へ戻る
          </Link>
        </div>
      </header>

      <form
        className="form card-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        // Ctrl + Enter で保存する ( specs.md §5.3 ). textarea 内でも効くよう form 側で拾う.
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <h2 className="card-form__title">
          {editingId === null ? 'カードを追加' : 'カードを更新'}
        </h2>

        <label className="field">
          <span className="field__label">用語 ( 表 )</span>
          <textarea
            ref={termRef}
            className="input"
            rows={2}
            value={input.term}
            onChange={(event) => setInput({ ...input, term: event.target.value })}
            maxLength={1000}
          />
        </label>

        <label className="field">
          <span className="field__label">定義 ( 裏 )</span>
          <textarea
            className="input"
            rows={3}
            value={input.definition}
            onChange={(event) => setInput({ ...input, definition: event.target.value })}
            maxLength={2000}
          />
        </label>

        <label className="field">
          <span className="field__label">ヒント ( 任意 )</span>
          <input
            className="input"
            value={input.hint}
            onChange={(event) => setInput({ ...input, hint: event.target.value })}
            maxLength={200}
          />
        </label>

        {error !== null && <p className="alert">{error}</p>}

        <div className="form__actions">
          {editingId !== null && (
            <button type="button" className="btn" onClick={resetForm}>
              編集をやめる
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={isBlank}>
            {editingId === null ? '追加' : '更新'}
          </button>
        </div>
        <p className="hint">Ctrl + Enter でも保存できます.</p>
      </form>

      <div className="toolbar">
        <span className="toolbar__label">カード {cards.length} 枚</span>
        <div className="toolbar__group">
          <button
            type="button"
            className="btn btn--small"
            disabled={cards.length < 2}
            onClick={() => void sortCards(setId, 'term')}
          >
            用語の昇順に整列
          </button>
          <button
            type="button"
            className="btn btn--small"
            disabled={cards.length < 2}
            onClick={() => void sortCards(setId, 'createdAt')}
          >
            作成日時順に整列
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="empty">まだカードがありません.</p>
      ) : (
        <ul className="cards cards--editable">
          {cards.map((card, index) => (
            <li
              key={card.id}
              className={`cards__item ${editingId === card.id ? 'cards__item--editing' : ''}`}
            >
              <button
                type="button"
                className={`star ${card.starred ? 'star--on' : ''}`}
                aria-label={card.starred ? '★を外す' : '★を付ける'}
                aria-pressed={card.starred}
                onClick={() => void setStarred(card.id, !card.starred)}
              >
                ★
              </button>
              <div className="cards__term">{card.term}</div>
              <div className="cards__definition">{card.definition}</div>
              {card.hint !== '' && <div className="cards__hint">ヒント: {card.hint}</div>}
              <div className="cards__tools">
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="上へ移動"
                  disabled={index === 0}
                  onClick={() => void moveCard(card.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="下へ移動"
                  disabled={index === cards.length - 1}
                  onClick={() => void moveCard(card.id, 1)}
                >
                  ↓
                </button>
                <button type="button" className="btn btn--small" onClick={() => startEdit(card)}>
                  編集
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => setPendingDelete(card)}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={pendingDelete !== null}
        title="カードを削除"
        onClose={() => setPendingDelete(null)}
      >
        {pendingDelete !== null && (
          <div className="form">
            <p>
              「{pendingDelete.term === '' ? '( 用語なし )' : pendingDelete.term}」を削除します。
              このカードの進捗も一緒に削除されます。
            </p>
            <div className="form__actions">
              <button type="button" className="btn" onClick={() => setPendingDelete(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => void confirmDelete(pendingDelete)}
              >
                削除
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
