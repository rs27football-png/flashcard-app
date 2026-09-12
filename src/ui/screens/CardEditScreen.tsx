import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Asset, Card, Folder } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import { listAssets } from '../../core/db/assets'
import {
  createCard,
  deleteCard,
  listCards,
  reorderCards,
  setStarred,
  sortCards,
  updateCard,
  type CardInput,
  type ImageEdit,
} from '../../core/db/cards'
import { getSet, updateSetInfo } from '../../core/db/sets'
import { DEFAULT_APP_SETTINGS, getAppSettings } from '../../core/db/settings'
import { compressImage, isImageFile } from '../../core/media/compress'
import { Breadcrumb } from '../components/Breadcrumb'
import { Icon } from '../components/Icon'
import { ImageField } from '../components/ImageField'
import { MathPalette } from '../components/MathPalette'
import { Modal } from '../components/Modal'
import { RichText } from '../components/RichText'
import { useAssetUrls } from '../hooks/useAssetUrls'
import { useGoBack } from '../hooks/useGoBack'
import { ORDER_ATTRIBUTE, useReorderDrag } from '../hooks/useReorderDrag'

const KEEP: ImageEdit = { kind: 'keep' }
const EMPTY_INPUT: CardInput = {
  term: '',
  definition: '',
  hint: '',
  termImage: KEEP,
  definitionImage: KEEP,
}

/** 数式の入力補助を差し込める欄 */
type TextField = 'term' | 'definition' | 'hint'

/** S3 カード編集. 追加 / 更新 / 削除 / 並べ替え (specs.md §3, §4.3) */
export function CardEditScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const goBack = useGoBack(`/sets/${setId}`)
  const set = useLiveQuery(async () => (await getSet(setId)) ?? null, [setId])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const cards = useLiveQuery(() => listCards(setId), [setId], [] as Card[])
  // 画像は行ごとに読まず, セット単位で1回だけ読んで ID から引く (specs.md §6.3)
  const assets = useLiveQuery(() => listAssets(setId), [setId], [] as Asset[])
  const assetUrls = useAssetUrls(assets)
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const settings = useLiveQuery(() => getAppSettings(), [], DEFAULT_APP_SETTINGS)

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
  const definitionRef = useRef<HTMLTextAreaElement>(null)
  const hintRef = useRef<HTMLInputElement>(null)
  /** 最後に触っていた欄. 数式の挿入先と, 貼り付けた画像を付ける面を決めるのに使う */
  const [activeField, setActiveField] = useState<TextField>('term')
  // 保存時に読むのは常に最新の入力値でなければならない. 日本語入力の確定を待つあいだに
  // 状態が変わるため, 描画時に閉じ込めた値ではなく ref 経由で参照する.
  // 書き換えは入力を受けた時点で行い, 描画中には触らない.
  const inputRef = useRef(input)
  /** 日本語入力の変換中かどうか. 未確定のまま保存すると欄に文字が残る */
  const composingRef = useRef(false)

  /** 画像だけのカードも作れるため, 画像が付いていれば空欄でも保存できる (specs.md §2.3) */
  const editingCard = editingId === null ? null : (cards.find((card) => card.id === editingId) ?? null)
  const hasImage = (edit: ImageEdit | undefined, current: string | null | undefined) =>
    edit === undefined || edit.kind === 'keep' ? (current ?? null) !== null : edit.kind === 'set'
  const isBlank =
    input.term.trim() === '' &&
    input.definition.trim() === '' &&
    !hasImage(input.termImage, editingCard?.termImageId) &&
    !hasImage(input.definitionImage, editingCard?.definitionImageId)

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
    const blank =
      values.term.trim() === '' &&
      values.definition.trim() === '' &&
      !hasImage(values.termImage, editingCard?.termImageId) &&
      !hasImage(values.definitionImage, editingCard?.definitionImageId)
    if (blank) return 'none'
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

  /**
   * 数式の記法をカーソル位置へ差し込む (specs.md §4.4.3).
   * 直前まで触っていた欄を対象にする.
   */
  const insertSnippet = (snippet: string, caret: number) => {
    const element =
      activeField === 'term'
        ? termRef.current
        : activeField === 'definition'
          ? definitionRef.current
          : hintRef.current
    if (element === null) return
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start
    const next = element.value.slice(0, start) + snippet + element.value.slice(end)
    updateInput({ [activeField]: next } as Partial<CardInput>)
    // 値の反映を待ってからカーソルを合わせる. 先に動かすと React の再描画で戻される
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(start + caret, start + caret)
    })
  }

  /** 貼り付けた画像を, 直前まで触っていた面に付ける (specs.md §4.4.2) */
  const pasteImage = async (file: File) => {
    try {
      const image = await compressImage(file, settings.imageMaxEdge)
      const side = activeField === 'definition' ? 'definitionImage' : 'termImage'
      updateInput({ [side]: { kind: 'set', image } } as Partial<CardInput>)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '画像を取り込めませんでした。')
    }
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
    // 画像は「触っていない」状態から始める. 明示的に差し替えるまで元のままにする
    const values: CardInput = {
      term: card.term,
      definition: card.definition,
      hint: card.hint,
      termImage: KEEP,
      definitionImage: KEEP,
    }
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
          <button type="button" className="btn" onClick={goBack}>
            戻る
          </button>
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
        // 入力しながらスクリーンショットを貼れるようにする. 画像欄が自分で処理した
        // 場合は defaultPrevented が立つため, ここでは扱わない
        onPaste={(event) => {
          if (!set.enableImages || event.defaultPrevented) return
          const file = event.clipboardData.files[0]
          if (!isImageFile(file)) return
          event.preventDefault()
          void pasteImage(file)
        }}
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
            onFocus={() => setActiveField('term')}
            onChange={(event) => updateInput({ term: event.target.value })}
            maxLength={1000}
          />
        </label>

        {set.enableImages && (
          <ImageField
            label="表の画像"
            current={
              editingCard?.termImageId != null
                ? (assetById.get(editingCard.termImageId) ?? null)
                : null
            }
            currentUrl={
              editingCard?.termImageId != null
                ? (assetUrls.get(editingCard.termImageId) ?? null)
                : null
            }
            edit={input.termImage ?? KEEP}
            onChange={(edit) => updateInput({ termImage: edit })}
            maxEdge={settings.imageMaxEdge}
          />
        )}

        <label className="field">
          <span className="field__label">定義 (裏)</span>
          <textarea
            ref={definitionRef}
            className="input"
            rows={3}
            value={input.definition}
            onFocus={() => setActiveField('definition')}
            onChange={(event) => updateInput({ definition: event.target.value })}
            maxLength={2000}
          />
        </label>

        {set.enableImages && (
          <ImageField
            label="裏の画像"
            current={
              editingCard?.definitionImageId != null
                ? (assetById.get(editingCard.definitionImageId) ?? null)
                : null
            }
            currentUrl={
              editingCard?.definitionImageId != null
                ? (assetUrls.get(editingCard.definitionImageId) ?? null)
                : null
            }
            edit={input.definitionImage ?? KEEP}
            onChange={(edit) => updateInput({ definitionImage: edit })}
            maxEdge={settings.imageMaxEdge}
          />
        )}

        <label className="field">
          <span className="field__label">ヒント (任意)</span>
          <input
            ref={hintRef}
            className="input"
            value={input.hint}
            onFocus={() => setActiveField('hint')}
            onChange={(event) => updateInput({ hint: event.target.value })}
            maxLength={200}
          />
        </label>

        {/* 数式は書いた形と出る形が違うため, 補助と確認をその場に置く (specs.md §4.4.3) */}
        {set.enableMath && (
          <div className="field">
            <span className="field__label">数式</span>
            <MathPalette onInsert={insertSnippet} />
            {(input.term !== '' || input.definition !== '' || input.hint !== '') && (
              <div className="math-preview">
                {input.term !== '' && (
                  <p className="math-preview__row">
                    <RichText text={input.term} math />
                  </p>
                )}
                {input.definition !== '' && (
                  <p className="math-preview__row">
                    <RichText text={input.definition} math />
                  </p>
                )}
                {input.hint !== '' && (
                  <p className="math-preview__row math-preview__row--hint">
                    <RichText text={input.hint} math />
                  </p>
                )}
              </div>
            )}
          </div>
        )}

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
              <div className="cards__term">
                {set.enableImages && card.termImageId !== null && (
                  <img
                    className="cards__thumb"
                    src={assetUrls.get(card.termImageId)}
                    alt="表の画像"
                  />
                )}
                <RichText text={card.term} math={set.enableMath} />
              </div>
              <div className="cards__definition">
                {set.enableImages && card.definitionImageId !== null && (
                  <img
                    className="cards__thumb"
                    src={assetUrls.get(card.definitionImageId)}
                    alt="裏の画像"
                  />
                )}
                <RichText text={card.definition} math={set.enableMath} />
              </div>
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
