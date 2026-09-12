import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder, StudySet } from '../../core/types'
import { getFolderPath, listFolders } from '../../core/db/folders'
import { countCardsPerSet, deleteSets, listAllSets } from '../../core/db/sets'
import { mergeSets, type MergeResult } from '../../core/db/setOps'
import { FolderSelect } from '../components/FolderSelect'
import { Icon } from '../components/Icon'
import { Toggle } from '../components/Toggle'
import { ORDER_ATTRIBUTE, useReorderDrag } from '../hooks/useReorderDrag'

type Step = 'pick' | 'settings'

/** 学習セットの統合 (specs.md §4.9.2). 手順1 で選び, 手順2 で順番と出力先を決める */
export function MergeScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  // 読み込み中と「見つからない」を区別するため, 既定値を渡さずに undefined を受ける
  const loadedSets = useLiveQuery(() => listAllSets(), [])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const cardCounts = useLiveQuery(() => countCardsPerSet(), [], new Map<string, number>())

  const [step, setStep] = useState<Step>('pick')
  /** 選んだ順. この順にカードを並べる. 始めたセットが1番に入った状態で始まる */
  const [selected, setSelected] = useState<string[]>([setId])
  const [destination, setDestination] = useState<'new' | 'existing'>('new')
  /** null の間は既定の名前を使う */
  const [newName, setNewName] = useState<string | null>(null)
  /** undefined の間は始めたセットと同じフォルダを使う */
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined)
  const [existingId, setExistingId] = useState(setId)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MergeResult | null>(null)
  /** 統合したあとに残っている統合元. 削除するかどうかはここで尋ねる (specs.md §4.9.2) */
  const [leftovers, setLeftovers] = useState<{ id: string; name: string }[]>([])
  const [sourceDecision, setSourceDecision] = useState<'pending' | 'kept' | 'deleted'>('pending')

  const sets = useMemo(() => loadedSets ?? [], [loadedSets])
  const setById = useMemo(() => new Map(sets.map((set) => [set.id, set])), [sets])
  const pathOf = (set: StudySet) =>
    getFolderPath(folders, set.folderId)
      .map((folder) => folder.name)
      .join(' / ') || 'ルート'
  const countOf = (id: string) => cardCounts.get(id) ?? 0

  const moveTo = (from: number, to: number) => {
    setSelected((previous) => {
      if (from === to || from < 0 || to < 0 || from >= previous.length || to >= previous.length) {
        return previous
      }
      const next = [...previous]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }
  const { dragIndex, insertIndex, start: startReorder } = useReorderDrag(moveTo)

  // 統合し終えたあとは, 元のセットが消えていても結果を出す
  if (result !== null) {
    const removeSources = async () => {
      setBusy(true)
      setError(null)
      try {
        await deleteSets(leftovers.map((source) => source.id))
        setSourceDecision('deleted')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '削除に失敗しました。')
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="screen">
        <h1 className="screen__title">統合しました</h1>
        <ul className="result-list">
          <li>{result.added} 枚を取り込みました。</li>
          {result.skipped > 0 && <li>完全一致のカード {result.skipped} 枚を除きました。</li>}
        </ul>

        {/* 取り込んだ結果を見てから決められるよう, 統合元の扱いはここで尋ねる (specs.md §4.9.2) */}
        {leftovers.length > 0 && sourceDecision === 'pending' && (
          <section className="section">
            <h2 className="section__title">統合元のセットはどうしますか?</h2>
            <p className="note">{leftovers.map((source) => source.name).join('、')}</p>
            <div className="form__actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setSourceDecision('kept')}
              >
                残す
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => void removeSources()}
              >
                {busy ? '削除中…' : `${leftovers.length} 件を削除する`}
              </button>
            </div>
          </section>
        )}
        {sourceDecision === 'kept' && <p className="note">統合元のセットは残しました。</p>}
        {sourceDecision === 'deleted' && (
          <p className="note">統合元の {leftovers.length} 件を削除しました。</p>
        )}
        {error !== null && <p className="alert">{error}</p>}

        <div className="form__actions form__actions--stack">
          <Link className="btn btn--primary btn--large" to={`/sets/${result.setId}`}>
            統合したセットを開く
          </Link>
          <Link className="btn" to="/">
            ホームへ戻る
          </Link>
        </div>
      </div>
    )
  }

  if (loadedSets === undefined) return <p className="empty">読み込み中…</p>
  const current = setById.get(setId)
  if (current === undefined) {
    return (
      <div className="screen">
        <p className="empty">この学習セットは見つかりませんでした。</p>
        <Link className="btn" to="/">
          ホームへ戻る
        </Link>
      </div>
    )
  }

  const name = newName ?? `${current.name} (統合)`
  const targetFolderId = folderId === undefined ? current.folderId : folderId

  const toggle = (id: string) => {
    // 外すと後ろの番号が詰まる. 選び直せば順番も付け直せる
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  }

  if (step === 'pick') {
    const sorted = [...sets].sort(
      (a, b) => pathOf(a).localeCompare(pathOf(b), 'ja') || a.name.localeCompare(b.name, 'ja'),
    )
    return (
      <div className="screen">
        <header className="screen__head">
          <div>
            <h1 className="screen__title">セットを統合</h1>
            <p className="screen__desc">
              統合するセットを選んでください。選んだ順に番号が付き、その順にカードが並びます。
            </p>
          </div>
          <div className="screen__actions">
            <Link className="btn" to={`/sets/${setId}`}>
              戻る
            </Link>
          </div>
        </header>

        <ul className="pick-list">
          {sorted.map((set) => {
            const order = selected.indexOf(set.id)
            return (
              <li key={set.id}>
                <button
                  type="button"
                  className={`pick-row ${order >= 0 ? 'pick-row--on' : ''}`}
                  aria-pressed={order >= 0}
                  onClick={() => toggle(set.id)}
                >
                  {order >= 0 ? (
                    <span className="pick-num">{order + 1}</span>
                  ) : (
                    <span className="pick-box" aria-hidden="true" />
                  )}
                  <span className="pick-row__main">
                    <span className="pick-row__name">
                      {set.name}
                      {set.id === setId && <span className="pick-tag">このセット</span>}
                    </span>
                    <span className="pick-row__path">{pathOf(set)}</span>
                  </span>
                  <span className="pick-row__meta">{countOf(set.id)} 枚</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="sticky-actions">
          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={selected.length < 2}
            onClick={() => {
              if (!selected.includes(existingId)) setExistingId(selected[0])
              setStep('settings')
            }}
          >
            {selected.length < 2 ? '2つ以上選んでください' : `${selected.length} 件で次へ`}
          </button>
        </div>
      </div>
    )
  }

  // --- 手順2: 順番と出力先 ---
  const incoming = selected
    .filter((id) => destination === 'new' || id !== existingId)
    .reduce((sum, id) => sum + countOf(id), 0)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const merged = await mergeSets({
        sourceIds: selected,
        destination:
          destination === 'new'
            ? { kind: 'new', name, folderId: targetFolderId }
            : { kind: 'existing', setId: existingId },
        skipDuplicates,
        // 統合元を削除するかどうかは, 結果を見せてから尋ねる (specs.md §4.9.2)
        deleteSources: false,
      })
      setLeftovers(
        selected
          .filter((id) => id !== merged.setId)
          .map((id) => ({ id, name: setById.get(id)?.name ?? '' })),
      )
      setResult(merged)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '統合に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">統合の設定</h1>
        <div className="screen__actions">
          <button type="button" className="btn" onClick={() => setStep('pick')}>
            選び直す
          </button>
        </div>
      </header>

      <section className="section">
        <h2 className="section__title">並び順</h2>
        <p className="note">この順にカードが並びます。右のつまみをドラッグして入れ替えられます。光った線の位置に入ります。</p>
        <ol className="order-list">
          {selected.map((id, index) => {
            const set = setById.get(id)
            if (set === undefined) return null
            return (
              <li
                key={id}
                className={[
                  'order-row',
                  dragIndex === index ? 'order-row--dragging' : '',
                  // 挿入先の目印。この行の上に入る
                  insertIndex === index ? 'order-row--insert' : '',
                  // 末尾に入る場合は最後の行の下に出す
                  insertIndex === selected.length && index === selected.length - 1
                    ? 'order-row--insert-end'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...{ [ORDER_ATTRIBUTE]: index }}
              >
                <span className="pick-num">{index + 1}</span>
                <span className="order-row__name">
                  {set.name}
                  {destination === 'existing' && id === existingId && (
                    <span className="pick-tag">追記先</span>
                  )}
                </span>
                <span className="pick-row__meta">{countOf(id)} 枚</span>
                {/* つまみだけを掴めるようにして, 画面の縦スクロールと競合させない */}
                <button
                  type="button"
                  className="order-grip"
                  aria-label={`${set.name} を掴んで並べ替え`}
                  title="ドラッグして並べ替え"
                  onPointerDown={(event) => startReorder(event, index)}
                >
                  <Icon name="grip" size={17} />
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="section">
        <h2 className="section__title">統合先</h2>
        <div className="radios">
          <label className="check">
            <input
              type="radio"
              name="merge-destination"
              checked={destination === 'new'}
              onChange={() => setDestination('new')}
            />
            新しいセットを作る
          </label>
          <label className="check">
            <input
              type="radio"
              name="merge-destination"
              checked={destination === 'existing'}
              onChange={() => setDestination('existing')}
            />
            既存のセットに追記する
          </label>
        </div>

        {destination === 'new' ? (
          <div className="form" style={{ marginTop: '0.75rem' }}>
            <label className="field">
              <span className="field__label">新しいセットの名前</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={100}
              />
            </label>
            <label className="field">
              <span className="field__label">置くフォルダ</span>
              <FolderSelect folders={folders} value={targetFolderId} onChange={setFolderId} />
            </label>
          </div>
        ) : (
          <div className="form" style={{ marginTop: '0.75rem' }}>
            <label className="field">
              <span className="field__label">追記先 (統合するセットから選ぶ)</span>
              <select
                className="input"
                value={existingId}
                onChange={(event) => setExistingId(event.target.value)}
              >
                {selected.map((id) => (
                  <option key={id} value={id}>
                    {setById.get(id)?.name ?? ''}
                  </option>
                ))}
              </select>
            </label>
            <p className="note">
              追記先のカードは今の並びのまま先頭に残り、他のセットが番号の順に後ろへ続きます。
            </p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="options">
          <Toggle
            label="完全一致のカードを除外する"
            description="用語と定義が同じカードは1枚だけ残す"
            checked={skipDuplicates}
            onChange={setSkipDuplicates}
          />
        </div>
        <p className="note">
          取り込んだカードの進捗は未学習から始まります。画像と数式の設定は、どれか1つで有効なら有効になります。
          統合元のセットを削除するかどうかは、統合したあとに尋ねます。
        </p>
      </section>

      {error !== null && <p className="alert">{error}</p>}

      <div className="sticky-actions">
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={busy || (destination === 'new' && name.trim() === '')}
          onClick={() => void run()}
        >
          {busy ? '統合中…' : `統合する (${incoming} 枚)`}
        </button>
      </div>
    </div>
  )
}
