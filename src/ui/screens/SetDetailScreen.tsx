import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Card, Folder, ProgressSummary, QuizOptions, StudyOptions } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import { listCards, setStarred } from '../../core/db/cards'
import {
  getProgressSummary,
  getSet,
  updateQuizOptions,
  updateStudyOptions,
} from '../../core/db/sets'
import { resetProgress } from '../../core/db/progress'
import { normalizeQuizOptions, normalizeStudyOptions } from '../../core/study/options'
import { Breadcrumb } from '../components/Breadcrumb'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { ProgressBar } from '../components/ProgressBar'
import { QuizOptionsForm } from '../components/QuizOptionsForm'
import { StudyOptionsForm } from '../components/StudyOptionsForm'

const EMPTY_SUMMARY: ProgressSummary = { total: 0, known: 0, learning: 0, unseen: 0 }

/** S2 セット詳細. カード一覧と進捗サマリ ( specs.md §3, §4.2 ) */
export function SetDetailScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const navigate = useNavigate()
  const [starredOnly, setStarredOnly] = useState(false)
  const [studyOptions, setStudyOptions] = useState<StudyOptions | null>(null)
  const [quizOptions, setQuizOptions] = useState<QuizOptions | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

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
      <Breadcrumb
        folders={folders}
        folderId={set.folderId}
        current={set.name}
        currentSetId={set.id}
      />

      <header className="screen__head">
        <div>
          <h1 className="screen__title">{set.name}</h1>
          {set.description !== '' && <p className="screen__desc">{set.description}</p>}
        </div>
        <div className="screen__actions">
          {/* インポートへの導線はカード編集画面に集約している ( specs.md §4.3 ) */}
          <Link className="btn" to={`/sets/${set.id}/cards`}>
            <Icon name="edit" />
            カードを編集
          </Link>
          <Link className="btn" to={`/sets/${set.id}/settings`}>
            <Icon name="settings" />
            セット設定
          </Link>
          <button
            type="button"
            className="btn btn--primary"
            disabled={cards.length === 0}
            onClick={() => setStudyOptions(normalizeStudyOptions(set.studyOptions))}
          >
            <Icon name="play" />
            暗記モード
          </button>
          {/* 選択肢を作るにはカードが2枚以上要る ( specs.md §4.7.2 ) */}
          <button
            type="button"
            className="btn btn--primary"
            disabled={cards.length < 2}
            title={cards.length < 2 ? 'カードが2枚以上必要です' : undefined}
            onClick={() => setQuizOptions(normalizeQuizOptions(set.quizOptions))}
          >
            <Icon name="quiz" />
            4択モード
          </button>
        </div>
      </header>

      {/* 上のセット情報と下のカード一覧を区切る. 進捗とそのリセットを1つの枠にまとめる */}
      <section className="set-progress" aria-label="進捗">
        <ProgressBar summary={summary} />
        <div className="set-progress__actions">
          {/* 「最初からやり直す」( specs.md §4.6.6 ) は結果画面にもあるが,
              ラウンドの途中で戻したい場合のためにここからも辿れるようにする */}
          <button
            type="button"
            className="btn btn--small"
            disabled={summary.known + summary.learning === 0}
            onClick={() => setConfirmingReset(true)}
          >
            <Icon name="refresh" size={15} />
            進捗をリセット
          </button>
        </div>
      </section>

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
                <Icon name="star" size={17} />
              </button>
              <div className="cards__term">{card.term}</div>
              <div className="cards__definition">{card.definition}</div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={confirmingReset}
        title="進捗をリセット"
        onClose={() => setConfirmingReset(false)}
      >
        <div className="form">
          <p>
            「{set.name}」の全カードの進捗を未学習に戻します。カードそのものは削除されません。
          </p>
          <div className="form__actions">
            <button type="button" className="btn" onClick={() => setConfirmingReset(false)}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                void resetProgress(set.id).then(() => setConfirmingReset(false))
              }}
            >
              進捗を戻す
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={studyOptions !== null}
        title="暗記モードを開始"
        onClose={() => setStudyOptions(null)}
      >
        {studyOptions !== null && (
          <div className="form">
            <StudyOptionsForm
              value={studyOptions}
              onChange={setStudyOptions}
              starredCount={cards.filter((card) => card.starred).length}
            />
            <div className="form__actions">
              <button type="button" className="btn" onClick={() => setStudyOptions(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  // 次回の既定値として記憶する ( specs.md §2.7 )
                  void updateStudyOptions(set.id, studyOptions).then(() =>
                    navigate(`/sets/${set.id}/study`),
                  )
                }}
              >
                開始
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={quizOptions !== null}
        title="4択モードを開始"
        onClose={() => setQuizOptions(null)}
      >
        {quizOptions !== null && (
          <div className="form">
            <QuizOptionsForm
              value={quizOptions}
              onChange={setQuizOptions}
              starredCount={cards.filter((card) => card.starred).length}
              learningCount={summary.learning}
            />
            <div className="form__actions">
              <button type="button" className="btn" onClick={() => setQuizOptions(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  // 次回の既定値として記憶する ( specs.md §2.7 )
                  void updateQuizOptions(set.id, quizOptions).then(() =>
                    navigate(`/sets/${set.id}/quiz`),
                  )
                }}
              >
                開始
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
