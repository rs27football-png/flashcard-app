import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder, ProgressSummary } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import { listCards, setStarred } from '../../core/db/cards'
import { getProgressSummary, getSet } from '../../core/db/sets'
import { Breadcrumb } from '../components/Breadcrumb'
import { ProgressBar } from '../components/ProgressBar'

const EMPTY_SUMMARY: ProgressSummary = { total: 0, known: 0, learning: 0, unseen: 0 }

/** S2 セット詳細. カード一覧と進捗サマリ ( specs.md §3, §4.2 ) */
export function SetDetailScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const [starredOnly, setStarredOnly] = useState(false)

  // 不在を null で返す. undefined のままだと「読み込み中」と区別できないため.
  const set = useLiveQuery(async () => (await getSet(setId)) ?? null, [setId])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const cards = useLiveQuery(() => listCards(setId), [setId], [] as Card[])
  const summary = useLiveQuery(() => getProgressSummary(setId), [setId], EMPTY_SUMMARY)

  // useLiveQuery は初回に undefined を返す.
  if (set === undefined) {
    return <p className="empty">読み込み中…</p>
  }
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

  const visibleCards = starredOnly ? cards.filter((card) => card.starred) : cards

  return (
    <div className="screen">
      <Breadcrumb folders={folders} folderId={set.folderId} current={set.name} />

      <header className="screen__head">
        <div>
          <h1 className="screen__title">{set.name}</h1>
          {set.description !== '' && <p className="screen__desc">{set.description}</p>}
        </div>
        <div className="screen__actions">
          <Link className="btn" to={`/import?setId=${set.id}`}>
            テキストを取り込む
          </Link>
          <Link className="btn" to={`/sets/${set.id}/settings`}>
            セット設定
          </Link>
          <Link className="btn btn--primary" to={`/sets/${set.id}/cards`}>
            カードを編集
          </Link>
        </div>
      </header>

      <ProgressBar summary={summary} />

      <div className="toolbar">
        <span className="toolbar__label">カード {cards.length} 枚</span>
        <label className="check">
          <input
            type="checkbox"
            checked={starredOnly}
            onChange={(event) => setStarredOnly(event.target.checked)}
          />
          ★のみ表示
        </label>
      </div>

      {visibleCards.length === 0 ? (
        <p className="empty">
          {cards.length === 0
            ? 'カードがありません. 「カードを編集」から追加してください.'
            : '★を付けたカードはありません.'}
        </p>
      ) : (
        <ul className="cards">
          {visibleCards.map((card) => (
            <li key={card.id} className="cards__item">
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
            </li>
          ))}
        </ul>
      )}

      <p className="note">暗記モードと4択モードは段階3以降で追加します.</p>
    </div>
  )
}
