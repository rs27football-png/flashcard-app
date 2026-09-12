import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder } from '../../core/types'
import { listCards } from '../../core/db/cards'
import { listFolders } from '../../core/db/folders'
import { getSet } from '../../core/db/sets'
import { planSplit, splitSet, type SplitResult, type SplitRule } from '../../core/db/setOps'
import { FolderSelect } from '../components/FolderSelect'
import { Toggle } from '../components/Toggle'

type RuleKind = SplitRule['kind']

interface Done {
  result: SplitResult
  names: string[]
  sourceName: string
}

/** 学習セットの分割 (specs.md §4.9.3) */
export function SplitScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const set = useLiveQuery(async () => (await getSet(setId)) ?? null, [setId])
  const cards = useLiveQuery(() => listCards(setId), [setId], [] as Card[])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])

  const [kind, setKind] = useState<RuleKind>('count')
  const [size, setSize] = useState(20)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** null の間は既定の名前を使う */
  const [manualName, setManualName] = useState<string | null>(null)
  /** undefined の間は元のセットと同じフォルダを使う */
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined)
  const [moveCards, setMoveCards] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  // 分割し終えたあとは, 元のセットが消えていても結果を出す
  if (done !== null) {
    return (
      <div className="screen">
        <h1 className="screen__title">分割しました</h1>
        <p className="note">「{done.sourceName}」から {done.names.length} 個のセットを作りました.</p>
        <ul className="pick-list">
          {done.result.setIds.map((id, index) => (
            <li key={id}>
              <Link className="pick-row" to={`/sets/${id}`}>
                <span className="pick-num">{index + 1}</span>
                <span className="pick-row__main">
                  <span className="pick-row__name">{done.names[index]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {done.result.sourceDeleted ? (
          <p className="note">すべてのカードを移したため, 元のセットは削除しました.</p>
        ) : (
          <Link className="btn" to={`/sets/${setId}`}>
            元のセットへ戻る
          </Link>
        )}
      </div>
    )
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

  const name = manualName ?? `${set.name} (抜粋)`
  const targetFolderId = folderId === undefined ? set.folderId : folderId
  const rule: SplitRule =
    kind === 'count'
      ? { kind: 'count', size }
      : kind === 'starred'
        ? { kind: 'starred' }
        : { kind: 'manual', cardIds: [...picked], name }
  const plan = planSplit(set.name, cards, rule)
  const movedAll =
    moveCards && plan.reduce((sum, group) => sum + group.cards.length, 0) === cards.length

  // 1つにまとまるだけの分け方は分割にならないため受け付けない
  const invalidReason =
    cards.length === 0
      ? 'カードがありません.'
      : kind === 'manual'
        ? picked.size === 0
          ? '切り出すカードを選んでください.'
          : name.trim() === ''
            ? '新しいセットの名前を入れてください.'
            : null
        : plan.length < 2
          ? kind === 'count'
            ? `${cards.length} 枚より少ない枚数を指定してください.`
            : '★付きのカードと★なしのカードの両方が必要です.'
          : null

  const togglePick = (cardId: string) => {
    setPicked((previous) => {
      const next = new Set(previous)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await splitSet({ setId, rule, folderId: targetFolderId, moveCards })
      setDone({ result, names: plan.map((group) => group.name), sourceName: set.name })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分割に失敗しました.')
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">セットを分割</h1>
          <p className="screen__desc">
            {set.name} ({cards.length} 枚)
          </p>
        </div>
        <div className="screen__actions">
          <Link className="btn" to={`/sets/${setId}`}>
            戻る
          </Link>
        </div>
      </header>

      <section className="section">
        <h2 className="section__title">分け方</h2>
        <div className="radios">
          <label className="check">
            <input type="radio" name="split-kind" checked={kind === 'count'} onChange={() => setKind('count')} />
            枚数ごと
          </label>
          <label className="check">
            <input type="radio" name="split-kind" checked={kind === 'starred'} onChange={() => setKind('starred')} />
            ★の有無
          </label>
          <label className="check">
            <input type="radio" name="split-kind" checked={kind === 'manual'} onChange={() => setKind('manual')} />
            選んだカードを切り出す
          </label>
        </div>

        {kind === 'count' && (
          <label className="field" style={{ marginTop: '0.75rem' }}>
            <span className="field__label">1つのセットの枚数 (今の並び順で区切る)</span>
            <input
              className="input input--number"
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, cards.length)}
              value={size}
              onChange={(event) => setSize(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
            />
          </label>
        )}

        {kind === 'manual' && (
          <div className="form" style={{ marginTop: '0.75rem' }}>
            <label className="field">
              <span className="field__label">新しいセットの名前</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setManualName(event.target.value)}
                maxLength={100}
              />
            </label>
            <div className="toolbar" style={{ margin: 0 }}>
              <span className="toolbar__label">{picked.size} 枚を選択中</span>
              <button
                type="button"
                className="btn btn--small"
                onClick={() =>
                  setPicked(picked.size === cards.length ? new Set() : new Set(cards.map((card) => card.id)))
                }
              >
                {picked.size === cards.length ? '選択をすべて外す' : 'すべて選ぶ'}
              </button>
            </div>
            <ul className="pick-list">
              {cards.map((card) => (
                <li key={card.id}>
                  <label className="card-pick">
                    <input type="checkbox" checked={picked.has(card.id)} onChange={() => togglePick(card.id)} />
                    <span className="card-pick__text">
                      <span className="card-pick__term">
                        {card.starred && '★ '}
                        {card.term}
                      </span>
                      <span className="card-pick__def">{card.definition}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section__title">出力先</h2>
        <div className="form">
          <label className="field">
            <span className="field__label">置くフォルダ</span>
            <FolderSelect folders={folders} value={targetFolderId} onChange={setFolderId} />
          </label>
          <Toggle
            label="元のセットから取り除く (移動)"
            description="オフなら元のセットはそのまま残り, カードを複製する"
            checked={moveCards}
            onChange={setMoveCards}
          />
        </div>
        <p className="note">分割先は元の進捗とリッチコンテンツの設定を引き継ぎます.</p>
      </section>

      <section className="section">
        <h2 className="section__title">作られるセット</h2>
        {plan.length === 0 ? (
          <p className="note">まだありません.</p>
        ) : (
          <ul className="plan-list">
            {plan.map((group) => (
              <li key={group.name}>
                <span>{group.name}</span>
                <span className="pick-row__meta">{group.cards.length} 枚</span>
              </li>
            ))}
          </ul>
        )}
        {movedAll && (
          <p className="alert" style={{ marginTop: '0.75rem' }}>
            すべてのカードが移るため, 元のセット「{set.name}」は削除されます.
          </p>
        )}
      </section>

      {error !== null && <p className="alert">{error}</p>}

      <div className="sticky-actions">
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={busy || invalidReason !== null}
          onClick={() => void run()}
        >
          {busy ? '分割中…' : invalidReason ?? `${plan.length} 個のセットに分割する`}
        </button>
      </div>
    </div>
  )
}
