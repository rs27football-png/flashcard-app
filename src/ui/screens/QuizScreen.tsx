import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Asset, Card, QuizOptions, StudySet } from '../../core/types'
import { listAssets } from '../../core/db/assets'
import { listCards } from '../../core/db/cards'
import { getSet } from '../../core/db/sets'
import { loadProgressMap, recordQuizAnswer } from '../../core/db/progress'
import { getAppSettings } from '../../core/db/settings'
import { normalizeQuizOptions } from '../../core/study/options'
import {
  buildQuestionsFor,
  buildQuiz,
  type QuizEmptyReason,
  type QuizQuestion,
} from '../../core/study/quiz'
import { Icon } from '../components/Icon'
import { ImageViewer } from '../components/ImageViewer'
import { RichText } from '../components/RichText'
import { useAssetUrls } from '../hooks/useAssetUrls'

type Phase =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'empty'; reason: QuizEmptyReason }
  | { kind: 'quiz' }
  | { kind: 'result' }

/** 1問ぶんの解答. 結果画面の誤答一覧に用いる (specs.md §4.7.4) */
interface AnswerRecord {
  question: QuizQuestion
  /** 選んだ選択肢の文言. パスなら null */
  chosen: string | null
  correct: boolean
}

const EMPTY_MESSAGE: Record<QuizEmptyReason, string> = {
  'too-few-cards': 'カードが2枚未満のため、4択モードを始められません。',
  'no-starred': '★を付けたカードがありません。「★のみ」を外すか、カードに★を付けてください。',
  'no-learning': '学習中のカードがありません。「学習中のカードのみ」を外してください。',
  'no-questions': '出題できるカードがありません。選択肢を作るには、異なる答えを持つカードが2枚以上必要です。',
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes === 0 ? `${seconds}秒` : `${minutes}分${seconds}秒`
}

/** S6 4択モード + S7 結果 (specs.md §3, §4.7) */
export function QuizScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [set, setSet] = useState<StudySet | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  /** 全画面で見せている画像. null なら閉じている */
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [options, setOptions] = useState<QuizOptions | null>(null)
  /** 4択の結果を進捗に反映するか (specs.md §2.8). 設定画面ができるまでは既定値 */
  const [affectsProgress, setAffectsProgress] = useState(true)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  /** 現在の問題で選んだ選択肢. 'pass' は「分かりませんか?」 */
  const [selected, setSelected] = useState<number | 'pass' | null>(null)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [skipped, setSkipped] = useState({ empty: 0, noDistractor: 0 })
  const [startedAt, setStartedAt] = useState(0)
  const [finishedAt, setFinishedAt] = useState(0)

  const startWith = useCallback((next: QuizQuestion[]) => {
    setQuestions(next)
    setIndex(0)
    setSelected(null)
    setAnswers([])
    setStartedAt(Date.now())
    setFinishedAt(0)
    setPhase({ kind: 'quiz' })
  }, [])

  /** 出題を組む. 「学習中のみ」は解答で状態が変わるため, 組むたびに進捗を読み直す */
  const build = useCallback(
    async (setCardsForQuiz: Card[], quizOptions: QuizOptions) => {
      const progressMap = await loadProgressMap(setId)
      const result = buildQuiz(setCardsForQuiz, progressMap, quizOptions)
      setSkipped({ empty: result.skippedEmpty, noDistractor: result.skippedNoDistractor })
      if (result.emptyReason !== null) {
        setPhase({ kind: 'empty', reason: result.emptyReason })
        return
      }
      startWith(result.questions)
    },
    [setId, startWith],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const loadedSet = await getSet(setId)
      const loadedCards = await listCards(setId)
      const loadedAssets = await listAssets(setId)
      const settings = await getAppSettings()
      if (cancelled) return
      if (loadedSet === undefined) {
        setPhase({ kind: 'missing' })
        return
      }
      const quizOptions = normalizeQuizOptions(loadedSet.quizOptions)
      setSet(loadedSet)
      setCards(loadedCards)
      setAssets(loadedAssets)
      setOptions(quizOptions)
      setAffectsProgress(settings.quizAffectsProgress)
      await build(loadedCards, quizOptions)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [setId, build])

  const assetUrls = useAssetUrls(assets)
  const question = questions[index] ?? null
  const answered = selected !== null

  const choose = useCallback(
    (choice: number | 'pass') => {
      if (question === null || selected !== null) return
      if (typeof choice === 'number' && choice >= question.choices.length) return
      const picked = choice === 'pass' ? null : question.choices[choice]
      const correct = picked?.correct === true
      setSelected(choice)
      setAnswers((previous) => [
        ...previous,
        { question, chosen: picked?.text ?? null, correct },
      ])
      // 1回の正答で習得済, 誤答とパスで学習中 (specs.md §4.7.3)
      if (affectsProgress) void recordQuizAnswer(question.cardId, correct)
    },
    [question, selected, affectsProgress],
  )

  const next = useCallback(() => {
    if (selected === null) return
    if (index + 1 >= questions.length) {
      setFinishedAt(Date.now())
      setPhase({ kind: 'result' })
      return
    }
    setIndex((previous) => previous + 1)
    setSelected(null)
  }, [selected, index, questions.length])

  // キーボード操作 (specs.md §5.2).
  // 暗記モードと同じく, 購読は出題中に1回だけ張り, 中身は最新の処理を参照する.
  // 依存が変わるたびに張り替えると, 張り替えの合間の入力を取りこぼすため.
  const handleKeyRef = useRef<(event: KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    handleKeyRef.current = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return
      if (document.querySelector('dialog[open]') !== null) return

      if (event.key.length === 1 && event.key >= '1' && event.key <= '4') {
        event.preventDefault()
        choose(Number(event.key) - 1)
      } else if (event.key === 'Enter') {
        // フォーカス中のボタンが Enter でもう一度押されないよう, 既定動作を止める
        event.preventDefault()
        next()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        navigate(`/sets/${setId}`)
      }
    }
  })

  useEffect(() => {
    if (phase.kind !== 'quiz') return
    const listener = (event: KeyboardEvent) => handleKeyRef.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [phase.kind])

  if (phase.kind === 'loading') return <p className="empty">読み込み中…</p>

  if (phase.kind === 'missing' || set === null || options === null) {
    return (
      <div className="screen">
        <p className="empty">この学習セットは見つかりませんでした。</p>
        <Link className="btn" to="/">
          ホームへ戻る
        </Link>
      </div>
    )
  }

  if (phase.kind === 'empty') {
    return (
      <div className="screen">
        <h1 className="screen__title">{set.name}</h1>
        <p className="empty">{EMPTY_MESSAGE[phase.reason]}</p>
        {skipped.empty > 0 && (
          <p className="note">
            答えが空のカードが {skipped.empty} 枚あります。カード編集で答えを入れると出題されます。
          </p>
        )}
        <div className="form__actions">
          <Link className="btn btn--primary" to={`/sets/${setId}`}>
            セット詳細へ戻る
          </Link>
        </div>
      </div>
    )
  }

  if (phase.kind === 'result') {
    return (
      <QuizResult
        set={set}
        answers={answers}
        durationMs={finishedAt - startedAt}
        onRetryWrong={() => {
          const wrongIds = new Set(
            answers.filter((record) => !record.correct).map((record) => record.question.cardId),
          )
          startWith(
            buildQuestionsFor(
              cards.filter((card) => wrongIds.has(card.id)),
              cards,
              options.front,
              options.shuffle,
            ),
          )
        }}
        onRepeat={() => void build(cards, options)}
      />
    )
  }

  // --- 出題中 ---
  const total = questions.length
  const correctSoFar = answers.filter((record) => record.correct).length
  const lastCorrect = answers.at(-1)?.correct === true
  const promptSide = options.front === 'term' ? '用語' : '定義'
  const answerSide = options.front === 'term' ? '定義' : '用語'
  const skippedTotal = skipped.empty + skipped.noDistractor

  return (
    <div className="screen quiz">
      <header className="quiz__head">
        {/* 進捗は「現在の問題番号 / 総問題数」で示す (specs.md §4.7.3) */}
        <span className="quiz__count">
          問題 <strong>{index + 1}</strong> / {total}
        </span>
        <span className="quiz__score">正解 {correctSoFar}</span>
        <Link className="btn btn--small" to={`/sets/${setId}`}>
          <Icon name="close" size={15} />
          終了
        </Link>
      </header>
      <div className="quiz__meter" aria-hidden="true">
        <span style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }} />
      </div>

      {/* 除外した枚数は開始時に示す (specs.md §4.7.2) */}
      {index === 0 && !answered && skippedTotal > 0 && (
        <p className="note">
          {skipped.empty > 0 && `答えが空のカード ${skipped.empty} 枚を除きました。`}
          {skipped.noDistractor > 0 && `選択肢を作れないカード ${skipped.noDistractor} 枚を除きました。`}
        </p>
      )}

      {question !== null && (
        <>
          <section className="quiz__prompt">
            <span className="quiz__side">{promptSide}</span>
            {set?.enableImages === true && question.promptImageId !== null && (
              <img
                className="quiz__image"
                src={assetUrls.get(question.promptImageId)}
                alt="問題文の画像"
                // 図の細部が読めないと答えようがないため, 叩いたら拡大できるようにする
                onClick={() => {
                  const url =
                    question.promptImageId === null
                      ? undefined
                      : assetUrls.get(question.promptImageId)
                  if (url !== undefined) setViewerUrl(url)
                }}
              />
            )}
            <p className="quiz__text">
              <RichText text={question.prompt} math={set?.enableMath ?? false} />
            </p>
          </section>
          <p className="quiz__ask">{answerSide}を選んでください</p>

          <ol className="choices">
            {question.choices.map((choice, choiceIndex) => {
              // 誤答時は, 選んだものを赤, 正答を緑で併せて示す (specs.md §4.7.3)
              const state = !answered
                ? ''
                : choice.correct
                  ? 'choice--correct'
                  : selected === choiceIndex
                    ? 'choice--wrong'
                    : 'choice--dim'
              return (
                <li key={choiceIndex}>
                  <button
                    type="button"
                    className={`choice ${state}`}
                    disabled={answered}
                    onClick={() => choose(choiceIndex)}
                  >
                    <span className="choice__num">{choiceIndex + 1}</span>
                    {set?.enableImages === true && choice.imageId !== null && (
                      <img
                        className="choice__thumb"
                        src={assetUrls.get(choice.imageId)}
                        alt=""
                      />
                    )}
                    <span className="choice__text">
                      <RichText text={choice.text} math={set?.enableMath ?? false} />
                    </span>
                    {answered && choice.correct && (
                      <Icon name="check" size={18} className="choice__mark" />
                    )}
                    {answered && selected === choiceIndex && !choice.correct && (
                      <Icon name="close" size={18} className="choice__mark" />
                    )}
                  </button>
                </li>
              )
            })}
          </ol>

          {answered ? (
            <div
              className={`quiz__feedback ${
                lastCorrect ? 'quiz__feedback--correct' : 'quiz__feedback--wrong'
              }`}
              role="status"
            >
              <span>{lastCorrect ? '正解!' : selected === 'pass' ? 'パスしました' : '不正解'}</span>
              <button type="button" className="btn btn--primary" onClick={next}>
                {index + 1 >= total ? '結果を見る' : '次へ'}
              </button>
            </div>
          ) : (
            <div className="quiz__pass">
              {/* パスは正答を表示したうえで誤答として扱う (specs.md §4.7.3) */}
              <button type="button" className="btn btn--small" onClick={() => choose('pass')}>
                分かりませんか?
              </button>
            </div>
          )}
        </>
      )}

      {viewerUrl !== null && (
        <ImageViewer src={viewerUrl} alt="問題文の画像" onClose={() => setViewerUrl(null)} />
      )}

      <p className="hint study__keys">
        1〜{question?.choices.length ?? 4} 選択 / Enter 次へ / Esc 終了
      </p>
    </div>
  )
}

interface QuizResultProps {
  set: StudySet
  answers: readonly AnswerRecord[]
  durationMs: number
  onRetryWrong: () => void
  onRepeat: () => void
}

/** 4択の結果 (specs.md §4.7.4) */
function QuizResult({ set, answers, durationMs, onRetryWrong, onRepeat }: QuizResultProps) {
  const total = answers.length
  const correct = answers.filter((record) => record.correct).length
  const rate = total === 0 ? 0 : Math.round((correct / total) * 100)
  const wrong = answers.filter((record) => !record.correct)

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">4択の結果</h1>
          <p className="screen__desc">{set.name}</p>
        </div>
      </header>

      <div className="result">
        <div className="result__tile result__tile--known">
          <span className="result__num">{rate}%</span>
          正答率 ({correct} / {total} 問)
        </div>
        <div className="result__tile">
          <span className="result__num">{formatDuration(durationMs)}</span>
          所要時間
        </div>
      </div>

      {wrong.length === 0 ? (
        <p className="note">全問正解です。お疲れさまでした。</p>
      ) : (
        <section className="section">
          <h2 className="section__title">間違えた問題 ({wrong.length} 問)</h2>
          <ul className="wrong-list">
            {wrong.map((record, recordIndex) => (
              <li key={recordIndex} className="wrong-item">
                <p className="wrong-item__prompt">
                  <RichText text={record.question.prompt} math={set.enableMath} />
                </p>
                <dl className="wrong-item__rows">
                  <dt>正答</dt>
                  <dd className="wrong-item__answer">
                    <RichText text={record.question.answer} math={set.enableMath} />
                  </dd>
                  <dt>選んだ解答</dt>
                  <dd className="wrong-item__chosen">
                    {record.chosen === null ? (
                      'パス'
                    ) : (
                      <RichText text={record.chosen} math={set.enableMath} />
                    )}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="form__actions form__actions--stack">
        {wrong.length > 0 && (
          <button type="button" className="btn btn--primary" onClick={onRetryWrong}>
            <Icon name="refresh" size={16} />
            間違えた {wrong.length} 問だけ再挑戦
          </button>
        )}
        <button
          type="button"
          className={wrong.length === 0 ? 'btn btn--primary' : 'btn'}
          onClick={onRepeat}
        >
          もう一度
        </button>
        <Link className="btn" to={`/sets/${set.id}`}>
          セット詳細へ戻る
        </Link>
      </div>
    </div>
  )
}
