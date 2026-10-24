// 4択モードの出題 (specs.md §4.7).
import type { Card, CardProgress, QuizOptions } from '../types'
import { shuffle } from './buildQueue'

/** 選択肢の最大数 (specs.md §4.7.2) */
export const MAX_CHOICES = 4

export interface QuizChoice {
  text: string
  correct: boolean
  /** その文言を持つカードに添えられていた画像 (specs.md §4.4.2). 画像が無効なセットでは表示しない */
  imageId: string | null
  /**
   * その文言を持つカードの反対側 (specs.md §4.7.3).
   * 判定後に選択肢を裏返して, 誤答が何の語の説明だったのかを確かめるために使う.
   */
  flipText: string
}

export interface QuizQuestion {
  cardId: string
  /** 問題文 (front で指定した側) */
  prompt: string
  /** 問題文側の画像 */
  promptImageId: string | null
  /** 正答 (反対側) */
  answer: string
  /** 表示順に並べた選択肢. 2〜4個 */
  choices: QuizChoice[]
}

/** 4択モードを始められない理由. 画面で原因を説明するために区別する */
export type QuizEmptyReason = 'too-few-cards' | 'no-starred' | 'no-learning' | 'no-questions'

export interface QuizBuildResult {
  questions: QuizQuestion[]
  /** 答え (または問題文) が空で除外した枚数. 開始時に示す (specs.md §4.7.2) */
  skippedEmpty: number
  /** 誤答を1つも作れず除外した枚数 */
  skippedNoDistractor: number
  emptyReason: QuizEmptyReason | null
}

type Side = QuizOptions['front']

const oppositeOf = (side: Side): Side => (side === 'term' ? 'definition' : 'term')

/** その面の画像を指す項目名. 表なら termImageId, 裏なら definitionImageId */
const imageKeyOf = (side: Side): 'termImageId' | 'definitionImageId' =>
  side === 'term' ? 'termImageId' : 'definitionImageId'

const byOrder = (a: Card, b: Card) => a.order - b.order || a.createdAt - b.createdAt

/**
 * 答えになる側の文言を, 重複と空欄を除いて集める.
 * 問題ごとに全カードを走査すると, 1万枚のセットで枚数の2乗の計算になる. 一度だけ作って使い回す.
 */
function collectAnswerTexts(setCards: readonly Card[], answerSide: Side): string[] {
  const texts = new Set<string>()
  for (const card of setCards) {
    const text = card[answerSide]
    if (text !== '') texts.add(text)
  }
  return [...texts]
}

/** 答えの文言から, その文言を持つカードの付随情報を引くための控え */
interface AnswerSource {
  /** その面に添えられていた画像 (specs.md §4.4.2) */
  imageId: string | null
  /** 反対側の文言 (specs.md §4.7.3) */
  flipText: string
}

/**
 * 答えの文言から, 由来するカードの情報を引けるようにする.
 *
 * 誤答は文言だけを集めて作るため, 選択肢に画像を添えたり裏返したりするには
 * この対応表が要る. 同じ文言のカードが複数あるときは最初の1枚を採る.
 */
function collectAnswerSources(
  setCards: readonly Card[],
  answerSide: Side,
): Map<string, AnswerSource> {
  const key = imageKeyOf(answerSide)
  const otherSide = oppositeOf(answerSide)
  const sources = new Map<string, AnswerSource>()
  for (const card of setCards) {
    const text = card[answerSide]
    if (text === '' || sources.has(text)) continue
    sources.set(text, { imageId: card[key], flipText: card[otherSide] })
  }
  return sources
}

/**
 * 誤答を count 個まで選ぶ. 正答と同じ文言は除く.
 *
 * 同じ定義を持つ別の用語があると, 正解に見える選択肢が2つ並んでしまうため,
 * 他カード由来でも正答と一致する文言は使わない. 重複判定はテキストの完全一致 (specs.md §4.7.2).
 */
function pickDistractors(texts: readonly string[], answer: string, count: number): string[] {
  // 候補が少ないときは全体を混ぜて先頭から取る
  if (texts.length <= count * 4) {
    return shuffle(texts.filter((text) => text !== answer)).slice(0, count)
  }
  // 多いときは全体を混ぜずに無作為に引く. 候補は一意で正答は高々1つなので, すぐに埋まる
  const picked = new Set<string>()
  while (picked.size < count) {
    const text = texts[Math.floor(Math.random() * texts.length)]
    if (text !== answer) picked.add(text)
  }
  return [...picked]
}

/** 答え (または問題文) が空で, 出題できないカードか */
export function hasEmptySide(card: Card, front: Side): boolean {
  return card[front] === '' || card[oppositeOf(front)] === ''
}

/**
 * 1問を作る. 作れない場合は null (specs.md §4.7.2).
 * answerTexts は collectAnswerTexts で集めた, セット全体の答え側の文言.
 */
export function buildQuestion(
  card: Card,
  answerTexts: readonly string[],
  front: Side,
  answerSources: ReadonlyMap<string, AnswerSource> = new Map(),
): QuizQuestion | null {
  const prompt = card[front]
  const answer = card[oppositeOf(front)]
  if (prompt === '' || answer === '') return null

  const distractors = pickDistractors(answerTexts, answer, MAX_CHOICES - 1)
  // 誤答が3つに満たなければ選択肢を減らす. 2択も作れなければ出題しない
  if (distractors.length === 0) return null

  // 選択肢は毎回混ぜ, 正答の位置に偏りを出さない
  const choices = shuffle([
    {
      text: answer,
      correct: true,
      imageId: card[imageKeyOf(oppositeOf(front))],
      // 正答の反対側は問題文として既に出ているため, 裏返す用途では使わない
      flipText: prompt,
    },
    ...distractors.map((text) => ({
      text,
      correct: false,
      imageId: answerSources.get(text)?.imageId ?? null,
      flipText: answerSources.get(text)?.flipText ?? '',
    })),
  ])
  return {
    cardId: card.id,
    prompt,
    promptImageId: card[imageKeyOf(front)],
    answer,
    choices,
  }
}

function makeQuestions(targets: readonly Card[], setCards: readonly Card[], front: Side) {
  const answerTexts = collectAnswerTexts(setCards, oppositeOf(front))
  const answerSources = collectAnswerSources(setCards, oppositeOf(front))
  const questions: QuizQuestion[] = []
  let skippedEmpty = 0
  let skippedNoDistractor = 0
  for (const card of targets) {
    if (hasEmptySide(card, front)) {
      skippedEmpty += 1
      continue
    }
    const question = buildQuestion(card, answerTexts, front, answerSources)
    if (question === null) skippedNoDistractor += 1
    else questions.push(question)
  }
  return { questions, skippedEmpty, skippedNoDistractor }
}

/**
 * 出題プールを作る (specs.md §4.7.1, §4.7.2).
 * 誤答は出題プールではなく同一セット全体から選ぶ. ★や学習中で絞っても選択肢の幅を保つため.
 */
export function buildQuiz(
  setCards: readonly Card[],
  progressByCardId: ReadonlyMap<string, CardProgress>,
  options: QuizOptions,
): QuizBuildResult {
  const none = (reason: QuizEmptyReason): QuizBuildResult => ({
    questions: [],
    skippedEmpty: 0,
    skippedNoDistractor: 0,
    emptyReason: reason,
  })

  if (setCards.length < 2) return none('too-few-cards')

  let pool: Card[] = [...setCards]
  if (options.starredOnly) {
    pool = pool.filter((card) => card.starred)
    if (pool.length === 0) return none('no-starred')
  }
  if (options.learningOnly) {
    pool = pool.filter((card) => progressByCardId.get(card.id)?.status === 'learning')
    if (pool.length === 0) return none('no-learning')
  }

  const ordered = options.shuffle ? shuffle(pool) : pool.sort(byOrder)
  const made = makeQuestions(ordered, setCards, options.front)
  return { ...made, emptyReason: made.questions.length === 0 ? 'no-questions' : null }
}

/**
 * 渡された順のまま問題を組み直す. 中断からの再開に用いる (specs.md §4.7.4).
 *
 * 選択肢は保存していないため, 誤答は再開時に選び直される. まだ解いていない問題に
 * ついては差し支えなく, 解き終えた問題は結果だけを別に保持している.
 */
export function rebuildQuestions(
  ordered: readonly Card[],
  setCards: readonly Card[],
  front: Side,
): QuizQuestion[] {
  return makeQuestions(ordered, setCards, front).questions
}

/** 指定したカードだけで問題を作り直す. 「間違えた問題だけ再挑戦」に用いる (specs.md §4.7.4) */
export function buildQuestionsFor(
  targets: readonly Card[],
  setCards: readonly Card[],
  front: Side,
  shuffled: boolean,
): QuizQuestion[] {
  const ordered = shuffled ? shuffle(targets) : [...targets].sort(byOrder)
  return makeQuestions(ordered, setCards, front).questions
}
