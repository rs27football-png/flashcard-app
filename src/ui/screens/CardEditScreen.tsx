import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import {
  createCard,
  deleteCard,
  listCards,
  reorderCards,
  setStarred,
  sortCards,
  updateCard,
  type CardInput,
} from '../../core/db/cards'
import { getSet, updateSetInfo } from '../../core/db/sets'
import { Breadcrumb } from '../components/Breadcrumb'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { ORDER_ATTRIBUTE, useReorderDrag } from '../hooks/useReorderDrag'

const EMPTY_INPUT: CardInput = { term: '', definition: '', hint: '' }

/** S3 カード編集. 追加 / 更新 / 削除 / 並べ替え (specs.md §3, §4.3) */
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
  /**
   * セットの名前と説明の下書き。null なら保存済みの値をそのまま表示する。
   * 保存したら null に戻し、以降はライブクエリの値を映す (specs.md §4.2)。
   */
  const [infoDraft, setInfoDraft] = useState<{ name: string; description: string } | null>(null)
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
  /** ドラッグで動かした結果を order に書き戻す (specs.md §4.3) */
  const moveCardTo = (from: number, to: number) => {
    const next = [...cards]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    void reorderCards(
      setId,
      next.map((card) => card.id),
    )
  }
  const {
    dragIndex,
    insertIndex,
    point: dragPoint,
    start: startReorder,
  } = useReorderDrag(moveCardTo)

  const submit = async (): Promise<'added' | 'updated' | 'none'> => {
    // 変換が確定していないうちに保存すると, 未確定の文字列が欄に残る.
    // いったんフォーカスを外して確定させ, その入力が state に届くのを1周期待つ.
    if (composingRef.current) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const values = inputRef.current
    if (values.term.trim() === '' && values.definition.trim() === '') return 'none'
    try {
      if (editingId === null) {
        await createCard(setId, values)
      } else {
        await updateCard(editingId, values)
      }
      const result = editingId === null ? 'added' : 'updated'
      resetForm()
      // 連続追加を想定し, 保存後は入力欄をクリアして同じ画面に留まる (specs.md §4.3)
      termRef.current?.focus()
      return result
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存に失敗しました。')
      return 'none'
    }
  }

  /**
   * 追加・更新の結果を手応えとして返す。
   * 何枚目が増えたのかを示し、追加できたことを見て分かるようにする。
   */
  const handleSubmit = async () => {
    // cards はこの描画時点の一覧。書き込み前の枚数に1を足したものが追加後の枚数になる
    const addedNumber = cards.length + 1
    const result = await submit()
    if (result === 'added') notify(`${addedNumber}枚目のカードを追加しました`)
    else if (result === 'updated') notify('カードを更新しました')
  }

  /**
   * 明示的な「保存」.
   *
   * カードは追加・更新の時点で IndexedDB に書き込まれており, この操作がなくても
   * データは失われない. 書けているかどうかが利用者から見えないため, 手応えを返す
   * 場所として用意している. 書きかけの入力が残っていればここで確定させる.
   */
  const notify = (message: string) => {
    setSavedNotice(message)
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      setSavedNotice(null)
      noticeTimerRef.current = null
    }, 2400)
  }

  /** 表示に使う値。下書きがなければ保存済みの値をそのまま映す */
  const info = infoDraft ?? { name: set?.name ?? '', description: set?.description ?? '' }
  const infoDirty =
    infoDraft !== null &&
    set !== undefined &&
    set !== null &&
    (infoDraft.name.trim() !== set.name || infoDraft.description.trim() !== set.description)

  /**
   * セットの名前と説明を保存する (specs.md §4.2)。
   * @returns 実際に書き込んだかどうか
   */
  const saveInfo = async (): Promise<boolean> => {
    if (set === undefined || set === null || infoDraft === null) return false
    const name = infoDraft.name.trim()
    if (name === '') {
      setError('セット名を入れてください')
      return false
    }
    const description = infoDraft.description.trim()
    if (name === set.name && description === set.description) {
      setInfoDraft(null)
      return false
    }
    await updateSetInfo(setId, name, description)
    setInfoDraft(null)
    return true
  }

  const saveInfoOnly = async () => {
    if (await saveInfo()) notify('保存しました')
  }

  const saveNow = async () => {
    const addedNumber = cards.length + 1
    const result = await submit()
    const wroteInfo = await saveInfo()
    if (result === 'added') notify(`${addedNumber}枚目のカードを追加しました`)
    else if (result === 'updated') notify('カードを更新しました')
    else notify(wroteInfo ? '保存しました' : 'すべて保存済みです')
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
        <p className="empty">この学習セットは見つかりませんでした。</p>
        <Link className="btn" to="/">
          ホームへ戻る
        </Link>
      </div>
    )
  }

  return (
    <div className="screen">
      <Breadcrumb
        folders={folders}
        folderId={set.folderId}
        current={set.name}
        currentSetId={set.id}
      />

      <header className="screen__head">
        <h1 className="screen__title">カードを編集</h1>
        <div className="screen__actions">
          <Link className="btn" to={`/sets/${set.id}`}>
            戻る
          </Link>
          <button type="button" className="btn btn--save" onClick={() => void saveNow()}>
            <Icon name="check" />
            保存
          </button>
        </div>
      </header>

      {/* 名前と説明はセットの中身であるため、カードと同じ画面で直せるようにする (specs.md §4.2) */}
      <section className="section">
        <h2 className="section__title">セットの情報</h2>
        <div className="form">
          <label className="field">
            <span className="field__label">セット名</span>
            <input
              className="input"
              value={info.name}
              maxLength={100}
              onChange={(event) => setInfoDraft({ ...info, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">説明 (任意)</span>
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              value={info.description}
              onChange={(event) => setInfoDraft({ ...info, description: event.target.value })}
            />
          </label>
          {infoDirty && (
            <div className="form__actions">
              <button type="button" className="btn" onClick={() => setInfoDraft(null)}>
                取り消す
              </button>
              <button type="button" className="btn btn--save" onClick={() => void saveInfoOnly()}>
                変更を保存
              </button>
            </div>
          )}
        </div>
      </section>

      {/* セットの情報とカードの編集を見た目で分ける */}
      <hr className="divider" />

      {/*
        追加や保存の手応えは, カードの入力欄のすぐ上に出す. 画面の上端に出すと
        入力中の位置からは見えないためである. 出入りで下の内容がずれないよう,
        場所は常に空けておく. この余白がセットの情報との区切りも兼ねる.
      */}
      <div className="notice-slot" role="status" aria-live="polite">
        {savedNotice !== null && (
          <p className="save-note">
            <Icon name="check" size={16} />
            {savedNotice}
          </p>
        )}
      </div>

      <form
        className="form card-form"
        {...compositionHandlers}
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
        // Ctrl + Enter で保存する (specs.md §5.3). textarea 内でも効くよう form 側で拾う.
        // 変換確定の Enter を拾わないよう, 変換中は無視する.
        onKeyDown={(event) => {
          if (composingRef.current) return
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void handleSubmit()
          }
        }}
      >
        <div className="card-form__head">
          <h2 className="card-form__title">
            {editingId === null ? 'カードを追加' : 'カードを更新'}
          </h2>
          {/* 1枚ずつの追加とまとめての取り込みを同じ枠にまとめる (specs.md §4.3) */}
          <Link className="btn btn--small" to={`/import?setId=${set.id}`}>
            <Icon name="import" size={15} />
            インポート
          </Link>
        </div>

        <label className="field">
          <span className="field__label">用語 (表)</span>
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
          <span className="field__label">定義 (裏)</span>
          <textarea
            className="input"
            rows={3}
            value={input.definition}
            onChange={(event) => updateInput({ definition: event.target.value })}
            maxLength={2000}
          />
        </label>

        <label className="field">
          <span className="field__label">ヒント (任意)</span>
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
        <p className="hint">Ctrl + Enter でも保存できます。</p>
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
        <p className="empty">まだカードがありません。</p>
      ) : (
        <ul className="cards cards--editable">
          {cards.map((card, index) => (
            <li
              key={card.id}
              {...{ [ORDER_ATTRIBUTE]: index }}
              className={[
                'cards__item',
                editingId === card.id ? 'cards__item--editing' : '',
                dragIndex === index ? 'reorder--dragging' : '',
                // 挿入先の目印。この行の上に入る
                insertIndex === index ? 'reorder--insert-before' : '',
                // 末尾に入る場合は最後の行の下に出す
                insertIndex === cards.length && index === cards.length - 1
                  ? 'reorder--insert-after'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* つまみだけを掴めるようにして, 一覧の縦スクロールと競合させない */}
              <button
                type="button"
                className="reorder-grip"
                aria-label={`${card.term} を掴んで並べ替え`}
                title="ドラッグして並べ替え"
                onPointerDown={(event) => startReorder(event, index)}
              >
                <Icon name="grip" size={16} />
              </button>
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

      {/* 掴んだカードを指の先に見せる. 下の要素を拾えるよう pointer-events は無効 */}
      {dragIndex !== null && (
        <div className="drag-ghost" style={{ left: dragPoint.x, top: dragPoint.y }}>
          <Icon name="grip" size={14} />
          {cards[dragIndex]?.term ?? ''}
        </div>
      )}

      <Modal
        open={pendingDelete !== null}
        title="カードを削除"
        onClose={() => setPendingDelete(null)}
      >
        {pendingDelete !== null && (
          <div className="form">
            <p>
              「{pendingDelete.term === '' ? '(用語なし)' : pendingDelete.term}」を削除します。
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
