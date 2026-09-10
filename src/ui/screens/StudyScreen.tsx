import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type {
  Card,
  CardProgress,
  ProgressStatus,
  StudyOptions,
  StudySession,
  StudySet,
} from '../../core/types'
import { listCards } from '../../core/db/cards'
import { getSet, updateStudyOptions } from '../../core/db/sets'
import { loadProgressMap, resetProgress, restoreStatus, setStatus } from '../../core/db/progress'
import { deleteSession, getSession, isSessionUsable, saveSession } from '../../core/db/sessions'
import { buildLearningQueue, buildQueue, shuffle, type EmptyReason } from '../../core/study/buildQueue'
import { normalizeStudyOptions } from '../../core/study/options'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { StudyOptionsForm } from '../components/StudyOptionsForm'

/** これ以上動かしたら振り分けと見なす距離 ( ピクセル ) */
const SWIPE_THRESHOLD = 80
/** これ未満の移動はタップと見なし, カードを裏返す */
const TAP_SLOP = 8
/** 払ったカードが画面外へ抜けるまでの時間 ( ミリ秒 ). CSS の fly-out と揃える */
const FLY_OUT_MS = 260

type Phase =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'empty'; reason: EmptyReason }
  | { kind: 'resume'; session: StudySession }
  | { kind: 'study' }
  | { kind: 'result' }

/** 1手ぶんの履歴. ラウンド単位のスタックに積む ( specs.md §4.6.4 ) */
interface Decision {
  cardId: string
  known: boolean
  /** 判定前の status. 「1つ戻る」で書き戻す */
  previousStatus: ProgressStatus
}

const EMPTY_MESSAGE: Record<EmptyReason, string> = {
  'no-cards': 'このセットにはカードがありません.',
  'no-starred': '★を付けたカードがありません. 「★のみ」を外すか, カードに★を付けてください.',
  'all-known': 'すべてのカードが習得済です. 「最初からやり直す」で進捗を戻せます.',
}

/** S5 暗記モード + S7 結果 ( specs.md §3, §4.6 ) */
export function StudyScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [set, setSet] = useState<StudySet | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [progress, setProgress] = useState<Map<string, CardProgress>>(new Map())
  const [options, setOptions] = useState<StudyOptions | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(1)
  const [history, setHistory] = useState<Decision[]>([])
  // 中断から再開したラウンドの, 再開前に済ませた分の集計.
  // 「1つ戻る」の履歴はラウンドを跨いで復元しないが, 表示上の件数は
  // ラウンド全体のものでなければ辻褄が合わないため, 分けて持つ.
  const [baseCounts, setBaseCounts] = useState({ known: 0, learning: 0 })
  const [flipped, setFlipped] = useState(false)
  const [hintShown, setHintShown] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // 払ったカードは山から外して別の層で飛ばす. 山を先に次のカードへ進められるので,
  // 抜けていく札の裏から次の札が現れる見え方になる ( specs.md §4.6.2 ).
  const [flying, setFlying] = useState<{ text: string; direction: 1 | -1; from: number } | null>(
    null,
  )
  // 掴んでいるかどうかは見た目に出るため, ref ではなく状態として持つ
  const [held, setHeld] = useState(false)
  const dragStartRef = useRef<number | null>(null)
  const flyTimerRef = useRef<number | null>(null)

  // 毎描画で作り直すと, これに依存する useCallback が無効になるため記憶しておく
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const currentCard = cardById.get(queue[index]) ?? null
  /** 山の下で待っている次のカード. 輪郭だけを見せ, 内容は見せない */
  const nextCard = cardById.get(queue[index + 1]) ?? null
  const starredCount = cards.filter((card) => card.starred).length
  const knownInHistory = history.filter((decision) => decision.known).length
  const knownCount = baseCounts.known + knownInHistory
  const learningCount = baseCounts.learning + (history.length - knownInHistory)

  // 学習中は意図的にライブクエリを使わない.
  // 判定のたびに進捗を書き込むため, 購読していると自分の書き込みでキューが
  // 組み直されてしまう. 開始時に一度だけ読み, 以降は画面内の状態で進める.
  // 画面を離れたときに, 飛ばしている札の後始末が残らないようにする
  useEffect(
    () => () => {
      if (flyTimerRef.current !== null) window.clearTimeout(flyTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const loadedSet = await getSet(setId)
      const loadedCards = await listCards(setId)
      const progressMap = await loadProgressMap(setId)
      const session = await getSession(setId)
      if (cancelled) return

      if (loadedSet === undefined) {
        setPhase({ kind: 'missing' })
        return
      }
      const loadedOptions = normalizeStudyOptions(loadedSet.studyOptions)
      setSet(loadedSet)
      setCards(loadedCards)
      setProgress(progressMap)
      setOptions(loadedOptions)

      const existingIds = new Set(loadedCards.map((card) => card.id))
      if (
        session !== undefined &&
        isSessionUsable(session, existingIds, 'flashcard', loadedOptions)
      ) {
        setPhase({ kind: 'resume', session })
        return
      }

      const result = buildQueue(loadedCards, progressMap, loadedOptions)
      if (result.emptyReason !== null) {
        setPhase({ kind: 'empty', reason: result.emptyReason })
        return
      }
      setQueue(result.cardIds)
      setIndex(0)
      setRound(1)
      setHistory([])
      setBaseCounts({ known: 0, learning: 0 })
      setPhase({ kind: 'study' })
      if (loadedOptions.trackProgress) {
        await saveSession({
          setId,
          mode: 'flashcard',
          options: loadedOptions,
          queue: result.cardIds,
          currentIndex: 0,
          roundNumber: 1,
        })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [setId])

  /**
   * 中断状態を保存する.
   *
   * 進捗を把握しない設定では判定を永続化しないため, 再開してもラウンドの集計を
   * 復元できない. 中途半端な再開を提示しないよう, その場合は保存自体を行わない.
   */
  const persistSession = useCallback(
    (sessionOptions: StudyOptions, cardIds: string[], currentIndex: number, roundNumber: number) => {
      if (!sessionOptions.trackProgress) return
      void saveSession({
        setId,
        mode: 'flashcard',
        options: sessionOptions,
        queue: cardIds,
        currentIndex,
        roundNumber,
      })
    },
    [setId],
  )

  const startRound = useCallback(
    (cardIds: string[], roundNumber: number, roundOptions: StudyOptions) => {
      setQueue(cardIds)
      setIndex(0)
      setRound(roundNumber)
      setHistory([])
      setBaseCounts({ known: 0, learning: 0 })
      setFlipped(false)
      setHintShown(false)
      setPhase({ kind: 'study' })
      persistSession(roundOptions, cardIds, 0, roundNumber)
    },
    [persistSession],
  )

  const answer = useCallback(
    async (known: boolean) => {
      if (options === null) return
      const cardId = queue[index]
      if (cardId === undefined) return

      const previousStatus = progress.get(cardId)?.status ?? 'unseen'
      const nextStatus: ProgressStatus = known ? 'known' : 'learning'

      // trackProgress が false のときは永続化せず, ラウンド内の集計だけを動かす
      // ( specs.md §4.6.3 )
      if (options.trackProgress) {
        await setStatus(cardId, nextStatus)
        setProgress((previous) => {
          const next = new Map(previous)
          const record = previous.get(cardId)
          if (record !== undefined) {
            next.set(cardId, { ...record, status: nextStatus, lastAnsweredAt: Date.now() })
          }
          return next
        })
      }

      setHistory((previous) => [...previous, { cardId, known, previousStatus }])
      setFlipped(false)
      setHintShown(false)
      setDragX(0)

      const nextIndex = index + 1
      setIndex(nextIndex)
      if (nextIndex >= queue.length) {
        await deleteSession(setId)
        setPhase({ kind: 'result' })
      } else {
        persistSession(options, queue, nextIndex, round)
      }
    },
    [options, queue, index, progress, round, setId, persistSession],
  )

  const undo = useCallback(async () => {
    if (options === null) return
    const last = history.at(-1)
    if (last === undefined) return

    if (options.trackProgress) {
      await restoreStatus(last.cardId, last.previousStatus)
      setProgress((previous) => {
        const next = new Map(previous)
        const record = previous.get(last.cardId)
        if (record !== undefined) {
          next.set(last.cardId, { ...record, status: last.previousStatus })
        }
        return next
      })
    }
    setHistory((previous) => previous.slice(0, -1))
    setIndex((previous) => previous - 1)
    setFlipped(false)
    setHintShown(false)
    setDragX(0)
    persistSession(options, queue, index - 1, round)
  }, [options, history, queue, index, round, persistSession])

  /**
   * 学習中に設定を変更し, その場で反映する ( specs.md §4.6.2 ).
   *
   * 判定済みの分の集計と進捗はそのまま残し, まだ提示していない残りだけを
   * 新しい条件で組み直す. 設定を触るたびにラウンドが最初に戻ると流れが切れるため.
   */
  const applyOptions = useCallback(
    (nextOptions: StudyOptions) => {
      setOptions(nextOptions)
      void updateStudyOptions(setId, nextOptions)

      const answered = queue.slice(0, index)
      const answeredIds = new Set(answered)
      const candidates = cards
        .filter((card) => !answeredIds.has(card.id))
        .filter((card) => !nextOptions.starredOnly || card.starred)
        .filter(
          (card) =>
            !nextOptions.trackProgress || progress.get(card.id)?.status !== 'known',
        )
      const ordered = nextOptions.shuffle
        ? shuffle(candidates)
        : [...candidates].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      const nextQueue = [...answered, ...ordered.map((card) => card.id)]
      setQueue(nextQueue)

      if (nextQueue.length <= index) {
        // 条件を絞った結果, 残りが無くなった場合はその場でラウンドを終える
        void deleteSession(setId)
        setPhase({ kind: 'result' })
        return
      }
      if (nextOptions.trackProgress) {
        persistSession(nextOptions, nextQueue, index, round)
      } else {
        // 進捗を保存しない設定に変えたら, 古い中断状態を残さない
        void deleteSession(setId)
      }
    },
    [setId, queue, index, cards, progress, round, persistSession],
  )

  const toggleShuffle = useCallback(() => {
    if (options === null) return
    applyOptions({ ...options, shuffle: !options.shuffle })
  }, [options, applyOptions])

  /**
   * 判定を確定する. 札を別の層へ移してから山を進めるため,
   * 抜けていく札の裏から次の札が現れる.
   */
  const commit = useCallback(
    (known: boolean) => {
      if (currentCard === null || options === null || flying !== null) return
      // 判定と同時に山は次へ進むため, 見えていた面の文字をここで写し取っておく
      const showingTerm = flipped ? options.front === 'definition' : options.front === 'term'
      setFlying({
        text: showingTerm ? currentCard.term : currentCard.definition,
        direction: known ? 1 : -1,
        from: dragX,
      })
      setDragX(0)
      setHeld(false)
      dragStartRef.current = null
      void answer(known)
      flyTimerRef.current = window.setTimeout(() => {
        setFlying(null)
        flyTimerRef.current = null
      }, FLY_OUT_MS)
    },
    [currentCard, options, flipped, flying, dragX, answer],
  )

  const restart = useCallback(async () => {
    if (options === null) return
    await resetProgress(setId)
    const progressMap = await loadProgressMap(setId)
    setProgress(progressMap)
    setConfirmingReset(false)
    const result = buildQueue(cards, progressMap, options)
    if (result.emptyReason !== null) {
      setPhase({ kind: 'empty', reason: result.emptyReason })
      return
    }
    startRound(result.cardIds, 1, options)
  }, [options, cards, setId, startRound])

  // キーボード操作 ( specs.md §5.1 )
  useEffect(() => {
    if (phase.kind !== 'study') return
    const onKeyDown = (event: KeyboardEvent) => {
      // 入力欄にフォーカスがあるとき, およびダイアログを開いているあいだは横取りしない
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return
      if (document.querySelector('dialog[open]') !== null) return

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          commit(true)
          break
        case 'ArrowLeft':
          event.preventDefault()
          commit(false)
          break
        case ' ':
        case 'ArrowUp':
          event.preventDefault()
          setFlipped((previous) => !previous)
          break
        case 'Backspace':
          event.preventDefault()
          void undo()
          break
        case 'Escape':
          event.preventDefault()
          navigate(`/sets/${setId}`)
          break
        default:
          if (event.key === 's' || event.key === 'S') toggleShuffle()
          if (event.key === 'h' || event.key === 'H') setHintShown(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase.kind, commit, undo, toggleShuffle, navigate, setId])

  if (phase.kind === 'loading') return <p className="empty">読み込み中…</p>

  if (phase.kind === 'missing' || set === null || options === null) {
    return (
      <div className="screen">
        <p className="empty">この学習セットは見つかりませんでした.</p>
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
        <div className="form__actions">
          {phase.reason === 'all-known' && (
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmingReset(true)}
            >
              最初からやり直す
            </button>
          )}
          <Link className="btn btn--primary" to={`/sets/${setId}`}>
            セット詳細へ戻る
          </Link>
        </div>
        <ResetDialog
          open={confirmingReset}
          setName={set.name}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() => void restart()}
        />
      </div>
    )
  }

  if (phase.kind === 'resume') {
    const session = phase.session
    return (
      <div className="screen">
        <h1 className="screen__title">{set.name}</h1>
        <p className="note">
          前回の続きが残っています ( ラウンド {session.roundNumber} / {session.queue.length} 枚中{' '}
          {session.currentIndex} 枚まで )。
        </p>
        <div className="form__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const result = buildQueue(cards, progress, options)
              if (result.emptyReason !== null) {
                setPhase({ kind: 'empty', reason: result.emptyReason })
                return
              }
              startRound(result.cardIds, 1, options)
            }}
          >
            最初から始める
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setQueue(session.queue)
              setIndex(session.currentIndex)
              setRound(session.roundNumber)
              // 「1つ戻る」の履歴はラウンドを跨いで復元しない ( specs.md §4.6.4 ).
              // 一方で画面上の件数はラウンド全体を表す必要があるため, 再開前に
              // 判定済みだった分を進捗から数え直して土台に置く.
              setHistory([])
              setBaseCounts(
                session.queue.slice(0, session.currentIndex).reduce(
                  (counts, cardId) => {
                    const status = progress.get(cardId)?.status
                    if (status === 'known') counts.known += 1
                    else if (status === 'learning') counts.learning += 1
                    return counts
                  },
                  { known: 0, learning: 0 },
                ),
              )
              setPhase({ kind: 'study' })
            }}
          >
            続きから再開する
          </button>
        </div>
      </div>
    )
  }

  if (phase.kind === 'result') {
    return (
      <ResultView
        set={set}
        options={options}
        round={round}
        knownCount={knownCount}
        learningCount={learningCount}
        cards={cards}
        progress={progress}
        onContinueLearning={() => {
          const cardIds = buildLearningQueue(cards, progress, options)
          startRound(cardIds, round + 1, options)
        }}
        onRepeat={() => {
          const result = buildQueue(cards, progress, options)
          if (result.emptyReason !== null) {
            setPhase({ kind: 'empty', reason: result.emptyReason })
            return
          }
          startRound(result.cardIds, round + 1, options)
        }}
        onRestart={() => setConfirmingReset(true)}
        confirmingReset={confirmingReset}
        onCancelReset={() => setConfirmingReset(false)}
        onConfirmReset={() => void restart()}
      />
    )
  }

  // --- 学習中 ---
  const frontText =
    currentCard === null
      ? ''
      : options.front === 'term'
        ? currentCard.term
        : currentCard.definition
  const backText =
    currentCard === null
      ? ''
      : options.front === 'term'
        ? currentCard.definition
        : currentCard.term
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)
  const swiping = swipeProgress >= 1
  const sideLabel = (showBack: boolean) =>
    (showBack ? options.front === 'definition' : options.front === 'term') ? '用語' : '定義'

  return (
    <div className="screen study">
      <header className="study__head">
        <div className="study__counter study__counter--learning">
          学習中 <strong>{learningCount}</strong>
        </div>
        <div className="study__meta">
          <span>ラウンド {round}</span>
          <span>
            {Math.min(index + 1, queue.length)} / {queue.length}
          </span>
        </div>
        <div className="study__counter study__counter--known">
          知っている <strong>{knownCount}</strong>
        </div>
      </header>

      <div className="study__toolbar">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => void undo()}
          disabled={history.length === 0}
        >
          <Icon name="undo" size={15} />1つ戻る
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => setShowSettings(true)}
        >
          <Icon name="settings" size={15} />
          設定
        </button>
        <Link className="btn btn--small" to={`/sets/${setId}`}>
          <Icon name="close" size={15} />
          終了
        </Link>
      </div>

      <div className="study__card-area">
        {currentCard !== null && (
          <div
            className="stack"
            onPointerDown={(event) => {
              if (flying !== null) return
              event.currentTarget.setPointerCapture(event.pointerId)
              dragStartRef.current = event.clientX
              setHeld(true)
            }}
            onPointerMove={(event) => {
              if (dragStartRef.current === null) return
              setDragX(event.clientX - dragStartRef.current)
            }}
            onPointerUp={(event) => {
              const startX = dragStartRef.current
              dragStartRef.current = null
              setHeld(false)
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              if (startX === null) return
              const delta = event.clientX - startX
              if (Math.abs(delta) >= SWIPE_THRESHOLD) {
                // 右へ払えば「知っている」, 左へ払えば「学習中」( specs.md §4.6.2 )
                commit(delta > 0)
              } else {
                setDragX(0)
                if (Math.abs(delta) < TAP_SLOP) setFlipped((previous) => !previous)
              }
            }}
            onPointerCancel={() => {
              dragStartRef.current = null
              setHeld(false)
              setDragX(0)
            }}
          >
            {/* 後ろで待っている札. 内容は見せず, 手前が離れるほど迫り上がる */}
            {nextCard !== null && (
              <div
                className="stack__card stack__card--behind"
                aria-hidden="true"
                style={{
                  transform: `translateY(${10 - 10 * swipeProgress}px) scale(${0.94 + 0.06 * swipeProgress})`,
                }}
              />
            )}

            <div
              className={`stack__card stack__card--top ${flipped ? 'stack__card--flipped' : ''} ${
                held ? 'stack__card--held' : ''
              }`}
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 25}deg)`,
                borderColor: swiping
                  ? dragX > 0
                    ? 'var(--known)'
                    : 'var(--learning)'
                  : undefined,
              }}
            >
              <div className="study__face">
                <p className="study__text">{flipped ? backText : frontText}</p>
                <span className="study__side">{sideLabel(flipped)}</span>
              </div>
              {swipeProgress > 0.2 && (
                <span
                  className={`stack__verdict ${
                    dragX > 0 ? 'stack__verdict--known' : 'stack__verdict--learning'
                  }`}
                  style={{ opacity: swipeProgress }}
                >
                  {dragX > 0 ? '知っている' : '学習中'}
                </span>
              )}
            </div>

            {/* 判定した札. 山からは外れているので, 裏から次の札が見えている */}
            {flying !== null && (
              <div
                className={`stack__card stack__card--flying ${
                  flying.direction > 0 ? 'stack__card--fly-right' : 'stack__card--fly-left'
                }`}
                aria-hidden="true"
                style={{
                  transform: `translateX(${flying.from}px) rotate(${flying.from / 25}deg)`,
                  borderColor: flying.direction > 0 ? 'var(--known)' : 'var(--learning)',
                }}
              >
                <div className="study__face">
                  <p className="study__text">{flying.text}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="study__hint">
          {currentCard !== null && currentCard.hint !== '' ? (
            hintShown ? (
              <p className="note">ヒント: {currentCard.hint}</p>
            ) : (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setHintShown(true)}
              >
                <Icon name="lightbulb" size={15} />
                ヒントを見る
              </button>
            )
          ) : null}
        </div>
      </div>

      <div className="study__actions">
        <button
          type="button"
          className="btn btn--judge btn--judge-learning"
          onClick={() => commit(false)}
        >
          <Icon name="close" size={26} />
          <span className="btn__label">学習中</span>
        </button>
        <button
          type="button"
          className="btn btn--judge btn--judge-known"
          onClick={() => commit(true)}
        >
          <Icon name="check" size={26} />
          <span className="btn__label">知っている</span>
        </button>
      </div>

      <p className="hint study__keys">
        → 知っている / ← 学習中 / Space 裏返す / Backspace 1つ戻る / S シャッフル / H ヒント /
        Esc 終了
      </p>

      <Modal open={showSettings} title="学習の設定" onClose={() => setShowSettings(false)}>
        <div className="form">
          {/* 変更はその場で効く. 判定済みの分はそのままに, 残りだけを組み直す */}
          <StudyOptionsForm
            value={options}
            onChange={applyOptions}
            starredCount={starredCount}
            idPrefix="study-live"
          />
          <p className="note">変更はすぐに反映されます. これまでの判定は残ります.</p>
          <div className="form__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setShowSettings(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

interface ResultViewProps {
  set: StudySet
  options: StudyOptions
  round: number
  knownCount: number
  learningCount: number
  cards: readonly Card[]
  progress: ReadonlyMap<string, CardProgress>
  onContinueLearning: () => void
  onRepeat: () => void
  onRestart: () => void
  confirmingReset: boolean
  onCancelReset: () => void
  onConfirmReset: () => void
}

/** S7 結果 ( specs.md §4.6.5 ) */
function ResultView({
  set,
  options,
  round,
  knownCount,
  learningCount,
  cards,
  progress,
  onContinueLearning,
  onRepeat,
  onRestart,
  confirmingReset,
  onCancelReset,
  onConfirmReset,
}: ResultViewProps) {
  const remainingLearning = cards.filter(
    (card) =>
      progress.get(card.id)?.status === 'learning' && (!options.starredOnly || card.starred),
  ).length
  const allKnown = options.trackProgress && remainingLearning === 0

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">ラウンド {round} の結果</h1>
          <p className="screen__desc">{set.name}</p>
        </div>
      </header>

      <div className="result">
        <div className="result__tile result__tile--known">
          <span className="result__num">{knownCount}</span>
          知っている
        </div>
        <div className="result__tile result__tile--learning">
          <span className="result__num">{learningCount}</span>
          学習中
        </div>
      </div>

      {options.trackProgress ? (
        allKnown ? (
          <p className="note">
            対象のカードをすべて習得しました. お疲れさまでした.
          </p>
        ) : (
          <p className="note">学習中のカードが {remainingLearning} 枚残っています.</p>
        )
      ) : (
        <p className="note">
          進み具合を把握しない設定のため, 今回の判定は保存していません.
        </p>
      )}

      <div className="form__actions form__actions--stack">
        {options.trackProgress && remainingLearning > 0 && (
          <button type="button" className="btn btn--primary" onClick={onContinueLearning}>
            学習中の {remainingLearning} 枚を続ける
          </button>
        )}
        {!options.trackProgress && (
          <button type="button" className="btn btn--primary" onClick={onRepeat}>
            もう一度
          </button>
        )}
        <button type="button" className="btn" onClick={onRestart}>
          最初からやり直す
        </button>
        <Link className="btn" to={`/sets/${set.id}`}>
          セット詳細へ戻る
        </Link>
      </div>

      <ResetDialog
        open={confirmingReset}
        setName={set.name}
        onCancel={onCancelReset}
        onConfirm={onConfirmReset}
      />
    </div>
  )
}

function ResetDialog({
  open,
  setName,
  onCancel,
  onConfirm,
}: {
  open: boolean
  setName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open={open} title="最初からやり直す" onClose={onCancel}>
      <div className="form">
        <p>
          「{setName}」の全カードの進捗を未学習に戻します。カードそのものは削除されません。
        </p>
        <div className="form__actions">
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            進捗を戻す
          </button>
        </div>
      </div>
    </Modal>
  )
}
