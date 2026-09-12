import type { ProgressSummary } from '../../core/types'

/** セット詳細の進捗サマリ (specs.md §4.2) */
export function ProgressBar({ summary }: { summary: ProgressSummary }) {
  const { total, known, learning, unseen } = summary
  const rate = total === 0 ? 0 : Math.round((known / total) * 100)
  const percent = (count: number) => (total === 0 ? 0 : (count / total) * 100)

  return (
    <div className="progress">
      <div className="progress__head">
        <span>習得率 {rate}%</span>
        <span className="progress__total">全 {total} 枚</span>
      </div>
      <div
        className="progress__bar"
        role="img"
        aria-label={`習得済 ${known} 枚, 学習中 ${learning} 枚, 未学習 ${unseen} 枚`}
      >
        <span className="progress__seg progress__seg--known" style={{ width: `${percent(known)}%` }} />
        <span
          className="progress__seg progress__seg--learning"
          style={{ width: `${percent(learning)}%` }}
        />
      </div>
      <ul className="progress__legend">
        <li>
          <span className="dot dot--known" />習得済 {known}
        </li>
        <li>
          <span className="dot dot--learning" />学習中 {learning}
        </li>
        <li>
          <span className="dot dot--unseen" />未学習 {unseen}
        </li>
      </ul>
    </div>
  )
}
