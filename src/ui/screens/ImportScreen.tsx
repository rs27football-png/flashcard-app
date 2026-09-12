import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder, StudySet } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import { createCards, listCards } from '../../core/db/cards'
import { createSet, listAllSets } from '../../core/db/sets'
import {
  DEFAULT_IMPORT_OPTIONS,
  findDuplicateFlags,
  parseImportText,
  type CardSeparator,
  type ImportOptions,
  type TermSeparator,
} from '../../core/import/parseText'
import { FolderSelect } from '../components/FolderSelect'

/** プレビューに出す行数 (specs.md §4.5) */
const PREVIEW_LIMIT = 20

type Destination = 'new' | 'existing'

/** S4 インポート. テキスト貼り付け, 区切り文字指定, プレビュー (specs.md §3, §4.5) */
export function ImportScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetSetId = searchParams.get('setId')

  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const sets = useLiveQuery(() => listAllSets(), [], [] as StudySet[])

  const [text, setText] = useState('')
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS)
  const [destination, setDestination] = useState<Destination>(
    presetSetId === null ? 'new' : 'existing',
  )
  const [newName, setNewName] = useState('')
  const [newFolderId, setNewFolderId] = useState<string | null>(null)
  const [existingSetId, setExistingSetId] = useState(presetSetId ?? '')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 取り込み先が既存セットのときだけ, 重複判定のために現在のカードを読む
  const existingCards = useLiveQuery(
    async () =>
      destination === 'existing' && existingSetId !== '' ? await listCards(existingSetId) : [],
    [destination, existingSetId],
    [] as Card[],
  )

  // 入力のたびに解析し直すため, テキストと区切り指定が変わったときだけ計算する
  const parsed = useMemo(() => parseImportText(text, options), [text, options])
  const duplicateFlags = useMemo(
    () => (skipDuplicates ? findDuplicateFlags(parsed.cards, existingCards) : []),
    [skipDuplicates, parsed.cards, existingCards],
  )
  const duplicateCount = duplicateFlags.filter(Boolean).length
  const importCount = parsed.cards.length - duplicateCount

  const sortedSets = [...sets].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  const destinationReady =
    destination === 'new' ? newName.trim() !== '' : existingSetId !== ''
  const canRun = importCount > 0 && destinationReady && !running

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const targetId =
        destination === 'new'
          ? (await createSet({ name: newName, description: '', folderId: newFolderId })).id
          : existingSetId
      const target = parsed.cards.filter(
        (_, index) => !skipDuplicates || duplicateFlags[index] !== true,
      )
      await createCards(
        targetId,
        target.map((card) => ({
          term: card.term,
          definition: card.definition,
          // テキストインポートではヒントと画像を扱わない (specs.md §4.4.2, §4.5)
          hint: '',
        })),
      )
      navigate(`/sets/${targetId}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取り込みに失敗しました.')
      setRunning(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">テキストから取り込み</h1>
        <div className="screen__actions">
          <Link className="btn" to="/">
            ホームへ戻る
          </Link>
        </div>
      </header>

      <label className="field">
        <span className="field__label">
          貼り付け (Word, Excel, Google ドキュメントなどからそのまま貼れます)
        </span>
        <textarea
          className="input"
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'DNS\tドメイン名とIPアドレスを相互に変換する仕組み\nCIDR\t可変長のネットワーク部でIPアドレスを扱う方式'}
        />
      </label>

      <section className="section">
        <h2 className="section__title">区切り文字</h2>
        <SeparatorChoice
          legend="用語と定義のあいだ"
          name="term-separator"
          value={options.termSeparator}
          custom={options.termCustom}
          choices={[
            ['tab', 'Tab'],
            ['comma', 'カンマ'],
            ['custom', 'カスタム'],
          ]}
          onChange={(value, custom) =>
            setOptions({ ...options, termSeparator: value, termCustom: custom })
          }
        />
        <SeparatorChoice
          legend="カードのあいだ"
          name="card-separator"
          value={options.cardSeparator}
          custom={options.cardCustom}
          choices={[
            ['newline', '改行'],
            ['semicolon', 'セミコロン'],
            ['custom', 'カスタム'],
          ]}
          onChange={(value, custom) =>
            setOptions({ ...options, cardSeparator: value, cardCustom: custom })
          }
        />
      </section>

      <section className="section">
        <h2 className="section__title">取り込み先</h2>
        <div className="radios">
          <label className="check">
            <input
              type="radio"
              name="destination"
              checked={destination === 'new'}
              onChange={() => setDestination('new')}
            />
            新しい学習セットを作る
          </label>
          <label className="check">
            <input
              type="radio"
              name="destination"
              checked={destination === 'existing'}
              onChange={() => setDestination('existing')}
              disabled={sets.length === 0}
            />
            既存の学習セットに追記する
          </label>
        </div>

        {destination === 'new' ? (
          <div className="form">
            <label className="field">
              <span className="field__label">セット名</span>
              <input
                className="input"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={100}
              />
            </label>
            <label className="field">
              <span className="field__label">所属フォルダ</span>
              <FolderSelect folders={folders} value={newFolderId} onChange={setNewFolderId} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span className="field__label">追記先のセット</span>
            <select
              className="input"
              value={existingSetId}
              onChange={(event) => setExistingSetId(event.target.value)}
            >
              <option value="">(選択してください)</option>
              {sortedSets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="check check--block">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(event) => setSkipDuplicates(event.target.checked)}
          />
          用語と定義が完全に一致するカードを除外する
        </label>
      </section>

      <section className="section">
        <h2 className="section__title">プレビュー</h2>
        {parsed.cards.length === 0 ? (
          <p className="note">
            {text.trim() === ''
              ? 'テキストを貼り付けると, ここに取り込み結果が表示されます.'
              : 'カードを取り出せませんでした. 区切り文字の指定を確認してください.'}
          </p>
        ) : (
          <>
            <p className="note">
              解析 {parsed.cards.length} 枚
              {skipDuplicates && duplicateCount > 0 && ` / 重複 ${duplicateCount} 枚を除外`}
              {' / '}
              <strong>取り込み {importCount} 枚</strong>
              {parsed.cards.length > PREVIEW_LIMIT &&
                ` (先頭 ${PREVIEW_LIMIT} 件を表示)`}
            </p>
            {parsed.missingDefinitionCount > 0 && (
              <p className="alert">
                定義が空の行が {parsed.missingDefinitionCount} 件あります.
                区切り文字が現れなかった行です.
              </p>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">用語</th>
                    <th scope="col">定義</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.cards.slice(0, PREVIEW_LIMIT).map((card, index) => (
                    <tr
                      key={index}
                      className={
                        duplicateFlags[index] === true
                          ? 'table__row--skipped'
                          : card.missingDefinition
                            ? 'table__row--warn'
                            : undefined
                      }
                    >
                      <td>{card.term}</td>
                      <td>
                        {card.definition === '' ? (
                          <span className="table__warn">(定義なし)</span>
                        ) : (
                          card.definition
                        )}
                        {duplicateFlags[index] === true && (
                          <span className="badge">重複のため除外</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {error !== null && <p className="alert">{error}</p>}

      <div className="form__actions">
        <button type="button" className="btn btn--primary" disabled={!canRun} onClick={() => void run()}>
          {running ? '取り込み中…' : `${importCount} 枚を取り込む`}
        </button>
      </div>
    </div>
  )
}

interface SeparatorChoiceProps<T extends string> {
  legend: string
  name: string
  value: T
  custom: string
  choices: readonly (readonly [T, string])[]
  onChange: (value: T, custom: string) => void
}

function SeparatorChoice<T extends TermSeparator | CardSeparator>({
  legend,
  name,
  value,
  custom,
  choices,
  onChange,
}: SeparatorChoiceProps<T>) {
  return (
    <fieldset className="fieldset">
      <legend className="field__label">{legend}</legend>
      <div className="radios">
        {choices.map(([choice, label]) => (
          <label key={choice} className="check">
            <input
              type="radio"
              name={name}
              checked={value === choice}
              onChange={() => onChange(choice, custom)}
            />
            {label}
          </label>
        ))}
        {value === 'custom' && (
          <input
            className="input input--inline"
            value={custom}
            onChange={(event) => onChange(value, event.target.value)}
            placeholder="区切り文字"
            aria-label={`${legend}のカスタム区切り文字`}
          />
        )}
      </div>
    </fieldset>
  )
}
