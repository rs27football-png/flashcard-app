import { useEffect, useRef, useState } from 'react'
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
import { Icon } from '../components/Icon'
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
  /** 「保存」を押したときの手応え. データ自体は追加・更新の時点で書き込まれている */
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const termRef = useRef<HTMLTextAreaElement>(null)
  // 保存時に読むのは常に最新の入力値でなければならない. 日本語入力の確定を待つあいだに
  // 状態が変わるため, 描画時に閉じ込めた値ではなく ref 経由で参照する.
  // 書き換えは入力を受けた時点で行い, 描画中には触らない.
  const inputRef = useRef(input)
  /** 日本語入力の変換中かどうか. 未確定のまま保存すると欄に文字が残る */
  const composingRef = useRef(false)

  const isBlank = input.term.trim() === '' && input.definition.trim() === ''

  /** 入力値の更新はここに一本化し, state と ref を同時に進める */
  const updateInput = (patch: Partial<CardInput>) => {
    const next = { ...inputRef.current, ...patch }
    inputRef.current = next
    setInput(next)
  }

  const resetForm = () => {
    inputRef.current = EMPTY_INPUT
    setInput(EMPTY_INPUT)
    setEditingId(null)
    setError(null)
  }

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    },
    [],
  )

  /** @returns 実際に書き込んだかどうか */
  const submit = async (): Promise<boolean> => {
    // 変換が確定していないうちに保存すると, 未確定の文字列が欄に残る.
    // いったんフォーカスを外して確定させ, その入力が state に届くのを1周期待つ.
    if (composingRef.current) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const values = inputRef.current
    if (values.term.trim() === '' && values.definition.trim() === '') return false
    try {
      if (editingId === null) {
        await createCard(setId, values)
      } else {
        await updateCard(editingId, values)
      }
      resetForm()
      // 連続追加を想定し, 保存後は入力欄をクリアして同じ画面に留まる ( specs.md §4.3 )
      termRef.current?.focus()
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存に失敗しました.')
      return false
    }
  }

  /**
   * 明示的な「保存」.
   *
   * カードは追加・更新の時点で IndexedDB に書き込まれており, この操作がなくても
   * データは失われない. 書けているかどうかが利用者から見えないため, 手応えを返す
   * 場所として用意している. 書きかけの入力が残っていればここで確定させる.
   */
  const saveNow = async () => {
    const wrote = await submit()
    setSavedNotice(wrote ? '保存しました' : 'すべて保存済みです')
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      setSavedNotice(null)
      noticeTimerRef.current = null
    }, 2400)
  }

  /** 変換の開始と終了を拾う. どの入力欄でも同じ扱いでよいので form でまとめて受ける */
  const compositionHandlers = {
    onCompositionStart: () => {
      composingRef.current = true
    },
    onCompositionEnd: () => {
      composingRef.current = false
    },
  }

  const startEdit = (card: Card) => {
    const values = { term: card.term, definition: card.definition, hint: card.hint }
    setEditingId(card.id)
    inputRef.current = values
    setInput(values)
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
            戻る
          </Link>
          {/* カードを増やす操作をこの画面に集約する ( specs.md §4.3 ) */}
          <Link className="btn btn--primary" to={`/import?setId=${set.id}`}>
            <Icon name="import" />
            インポート
          </Link>
          <button type="button" className="btn btn--save" onClick={() => void saveNow()}>
            <Icon name="check" />
            保存
          </button>
        </div>
      </header>

      {savedNotice !== null && (
        <p className="save-note" role="status">
          <Icon name="check" size={16} />
          {savedNotice}
        </p>
      )}

      <form
        className="form card-form"
        {...compositionHandlers}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        // Ctrl + Enter で保存する ( specs.md §5.3 ). textarea 内でも効くよう form 側で拾う.
        // 変換確定の Enter を拾わないよう, 変換中は無視する.
        onKeyDown={(event) => {
          if (composingRef.current) return
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
            onChange={(event) => updateInput({ term: event.target.value })}
            maxLength={1000}
          />
        </label>

        <label className="field">
          <span className="field__label">定義 ( 裏 )</span>
          <textarea
            className="input"
            rows={3}
            value={input.definition}
            onChange={(event) => updateInput({ definition: event.target.value })}
            maxLength={2000}
          />
        </label>

        <label className="field">
          <span className="field__label">ヒント ( 任意 )</span>
          <input
            className="input"
            value={input.hint}
            onChange={(event) => updateInput({ hint: event.target.value })}
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
            <Icon name="sort" size={15} />
            用語の昇順
          </button>
          <button
            type="button"
            className="btn btn--small"
            disabled={cards.length < 2}
            onClick={() => void sortCards(setId, 'createdAt')}
          >
            <Icon name="sort" size={15} />
            作成日時順
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
                <Icon name="star" size={17} />
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
                  <Icon name="arrow-up" size={17} />
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="下へ移動"
                  disabled={index === cards.length - 1}
                  onClick={() => void moveCard(card.id, 1)}
                >
                  <Icon name="arrow-down" size={17} />
                </button>
                <button type="button" className="btn btn--small" onClick={() => startEdit(card)}>
                  <Icon name="edit" size={15} />
                  編集
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => setPendingDelete(card)}
                >
                  <Icon name="trash" size={15} />
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
