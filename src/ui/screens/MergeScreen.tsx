import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder, StudySet } from '../../core/types'
import { getFolderPath, listFolders } from '../../core/db/folders'
import { countCardsPerSet, listAllSets } from '../../core/db/sets'
import { mergeSets, type MergeResult } from '../../core/db/setOps'
import { FolderSelect } from '../components/FolderSelect'
import { Icon } from '../components/Icon'
import { Toggle } from '../components/Toggle'

type Step = 'pick' | 'settings'

/** 学習セットの統合 ( specs.md §4.9.2 ). 手順1 で選び, 手順2 で順番と出力先を決める */
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
  const [deleteSources, setDeleteSources] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MergeResult | null>(null)

  const sets = useMemo(() => loadedSets ?? [], [loadedSets])
  const setById = useMemo(() => new Map(sets.map((set) => [set.id, set])), [sets])
  const pathOf = (set: StudySet) =>
    getFolderPath(folders, set.folderId)
      .map((folder) => folder.name)
      .join(' / ') || 'ルート'
  const countOf = (id: string) => cardCounts.get(id) ?? 0

  // 統合し終えたあとは, 元のセットが消えていても結果を出す
  if (result !== null) {
    return (
      <div className="screen">
        <h1 className="screen__title">統合しました</h1>
        <ul className="result-list">
          <li>{result.added} 枚を取り込みました.</li>
          {result.skipped > 0 && <li>完全一致のカード {result.skipped} 枚を除きました.</li>}
          {result.deleted > 0 && <li>元のセット {result.deleted} 件を削除しました.</li>}
        </ul>
        <Link className="btn btn--primary btn--large" to={`/sets/${result.setId}`}>
          統合したセットを開く
        </Link>
      </div>
    )
  }

  if (loadedSets === undefined) return <p className="empty">読み込み中…</p>
  const current = setById.get(setId)
  if (current === undefined) {
    return (
      <div className="screen">
        <p className="empty">この学習セットは見つかりませんでした.</p>
        <Link className="btn" to="/">
          ホームへ戻る
        </Link>
      </div>
    )
  }

  const name = newName ?? `${current.name} ( 統合 )`
  const targetFolderId = folderId === undefined ? current.folderId : folderId

  const toggle = (id: string) => {
    // 外すと後ろの番号が詰まる. 選び直せば順番も付け直せる
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  }

  const move = (index: number, direction: -1 | 1) => {
    setSelected((previous) => {
      const next = [...previous]
      const target = index + direction
      if (target < 0 || target >= next.length) return previous
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
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
              統合するセットを選んでください. 選んだ順に番号が付き, その順にカードが並びます.
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
      setResult(
        await mergeSets({
          sourceIds: selected,
          destination:
            destination === 'new'
              ? { kind: 'new', name, folderId: targetFolderId }
              : { kind: 'existing', setId: existingId },
          skipDuplicates,
          deleteSources,
        }),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '統合に失敗しました.')
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
        <p className="note">この順にカードが並びます. ↑↓ で入れ替えられます.</p>
        <ol className="order-list">
          {selected.map((id, index) => {
            const set = setById.get(id)
            if (set === undefined) return null
            return (
              <li key={id} className="order-row">
                <span className="pick-num">{index + 1}</span>
                <span className="order-row__name">
                  {set.name}
                  {destination === 'existing' && id === existingId && (
                    <span className="pick-tag">追記先</span>
                  )}
                </span>
                <span className="pick-row__meta">{countOf(id)} 枚</span>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label={`${set.name} を上へ`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <Icon name="arrow-up" size={17} />
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label={`${set.name} を下へ`}
                  disabled={index === selected.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Icon name="arrow-down" size={17} />
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
              <span className="field__label">追記先 ( 統合するセットから選ぶ )</span>
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
              追記先のカードは今の並びのまま先頭に残り, 他のセットが番号の順に後ろへ続きます.
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
          <Toggle
            label="元のセットを削除する"
            description={
              destination === 'existing' ? '追記先以外の選んだセットを削除する' : '統合したあと, 選んだセットを削除する'
            }
            checked={deleteSources}
            onChange={setDeleteSources}
          />
        </div>
        <p className="note">
          取り込んだカードの進捗は未学習から始まります. 画像と数式の設定は, どれか1つで有効なら有効になります.
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
          {busy ? '統合中…' : `統合する ( ${incoming} 枚 )`}
        </button>
      </div>
    </div>
  )
}
