import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder, StudySet } from '../../core/types'
import { listAllCards } from '../../core/db/cards'
import { collectSubtreeIds, getFolderPath, listChildFolders, listFolders } from '../../core/db/folders'
import { listAllSets } from '../../core/db/sets'
import { findMatches, toSegments, type MatchRange } from '../../core/search/highlight'
import { normalizeForSearch } from '../../core/search/normalize'
import { MAX_CARD_HITS, search } from '../../core/search/search'
import { Icon } from '../components/Icon'

const ALL_FOLDERS = '__all__'
/** 入力が止まってから照合するまでの間. 1文字ごとに全件を照合し直さないため */
const DEBOUNCE_MS = 150

/** 一致した箇所だけを <mark> で囲む */
function Highlight({ text, ranges }: { text: string; ranges: readonly MatchRange[] }) {
  return (
    <>
      {toSegments(text, ranges).map((segment, index) =>
        segment.hit ? (
          <mark key={index} className="hit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

function folderOptions(folders: readonly Folder[], parentId: string | null, depth: number): { id: string; label: string }[] {
  return listChildFolders(folders, parentId).flatMap((folder) => [
    { id: folder.id, label: `${'　'.repeat(depth)}${folder.name}` },
    ...folderOptions(folders, folder.id, depth + 1),
  ])
}

/** S8 検索. 全セット横断の全文検索 (specs.md §3, §4.10) */
export function SearchScreen() {
  // 画面を開いている間は全カードを手元に持ち, 入力のたびに IndexedDB を読み直さない
  const cards = useLiveQuery(() => listAllCards(), [], [] as Card[])
  const sets = useLiveQuery(() => listAllSets(), [], [] as StudySet[])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scope, setScope] = useState(ALL_FOLDERS)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  // フォルダで絞るときは, そのフォルダと配下のフォルダに属するセットだけを対象にする
  const scopeSetIds = useMemo(() => {
    if (scope === ALL_FOLDERS) return null
    const folderIds = new Set(collectSubtreeIds(folders, scope))
    return new Set(
      sets.filter((set) => set.folderId !== null && folderIds.has(set.folderId)).map((set) => set.id),
    )
  }, [scope, folders, sets])

  const result = useMemo(
    () => search(debounced, cards, sets, scopeSetIds),
    [debounced, cards, sets, scopeSetIds],
  )
  const normalizedQuery = normalizeForSearch(debounced.trim())
  const setById = useMemo(() => new Map(sets.map((set) => [set.id, set])), [sets])
  const pathOf = (folderId: string | null) =>
    getFolderPath(folders, folderId)
      .map((folder) => folder.name)
      .join(' / ')

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">検索</h1>
        <div className="screen__actions">
          <Link className="btn" to="/">
            ホームへ戻る
          </Link>
        </div>
      </header>

      <div className="search-bar">
        <Icon name="search" />
        <input
          className="input search-bar__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="用語・定義・ヒント・セット名"
          aria-label="検索語"
          enterKeyHint="search"
          autoFocus
        />
      </div>

      <label className="field search-scope">
        <span className="field__label">探す範囲</span>
        <select className="input" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value={ALL_FOLDERS}>すべてのフォルダ</option>
          {folderOptions(folders, null, 0).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {normalizedQuery === '' ? (
        <p className="note">
          すべての学習セットから探します. ひらがなとカタカナ, 全角と半角, 大文字と小文字は区別しません.
        </p>
      ) : (
        <>
          {result.sets.length > 0 && (
            <section className="search-group">
              <h2 className="search-group__title">学習セット ({result.sets.length})</h2>
              <ul className="search-list">
                {result.sets.map((set) => (
                  <li key={set.id}>
                    <Link className="search-hit" to={`/sets/${set.id}`}>
                      <span className="search-hit__term">
                        <Icon name="set" className="icon--set" />
                        <span>
                          <Highlight text={set.name} ranges={findMatches(set.name, normalizedQuery)} />
                        </span>
                      </span>
                      <span className="search-hit__where">{pathOf(set.folderId) || 'ルート'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="search-group">
            <h2 className="search-group__title">
              カード ({result.totalCards})
              {result.totalCards > MAX_CARD_HITS && ` — 先頭 ${MAX_CARD_HITS} 件を表示`}
            </h2>
            {result.cards.length === 0 ? (
              <p className="note">一致するカードはありません.</p>
            ) : (
              <ul className="search-list">
                {result.cards.map((hit) => {
                  const set = setById.get(hit.card.setId)
                  const where = set === undefined ? '' : [pathOf(set.folderId), set.name].filter(Boolean).join(' / ')
                  return (
                    <li key={hit.card.id}>
                      {/* 当該セットの当該カードへ移動する (specs.md §4.10) */}
                      <Link className="search-hit" to={`/sets/${hit.card.setId}?card=${hit.card.id}`}>
                        <span className="search-hit__term">
                          <span>
                            <Highlight text={hit.card.term} ranges={hit.term} />
                          </span>
                        </span>
                        <span className="search-hit__definition">
                          <Highlight text={hit.card.definition} ranges={hit.definition} />
                        </span>
                        {hit.hint.length > 0 && (
                          <span className="search-hit__hint">
                            ヒント: <Highlight text={hit.card.hint} ranges={hit.hint} />
                          </span>
                        )}
                        <span className="search-hit__where">{where}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
