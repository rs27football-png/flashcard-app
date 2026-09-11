import type { QuizOptions } from '../../core/types'
import { Toggle } from './Toggle'

interface QuizOptionsFormProps {
  value: QuizOptions
  onChange: (options: QuizOptions) => void
  /** ★付きのカードが無いときに「★のみ」を選ばせないため */
  starredCount: number
  /** 学習中のカードが無いときに「学習中のみ」を選ばせないため */
  learningCount: number
}

/** 4択モードの出題オプション ( specs.md §2.7, §4.7.1 ) */
export function QuizOptionsForm({
  value,
  onChange,
  starredCount,
  learningCount,
}: QuizOptionsFormProps) {
  return (
    <div className="options">
      <Toggle
        label="★を付けたカードのみ"
        description={starredCount === 0 ? '★付きのカードがありません' : `${starredCount} 枚`}
        checked={value.starredOnly}
        disabled={starredCount === 0}
        onChange={(checked) => onChange({ ...value, starredOnly: checked })}
      />
      <Toggle
        label="学習中のカードのみ"
        description={learningCount === 0 ? '学習中のカードがありません' : `${learningCount} 枚`}
        checked={value.learningOnly}
        disabled={learningCount === 0}
        onChange={(checked) => onChange({ ...value, learningOnly: checked })}
      />
      <Toggle
        label="シャッフル"
        description="出題順を毎回入れ替える"
        checked={value.shuffle}
        onChange={(checked) => onChange({ ...value, shuffle: checked })}
      />

      <fieldset className="fieldset">
        <legend className="field__label">問題文にする側</legend>
        <div className="radios">
          <label className="check">
            <input
              type="radio"
              name="quiz-front"
              checked={value.front === 'term'}
              onChange={() => onChange({ ...value, front: 'term' })}
            />
            用語 ( 定義を選ぶ )
          </label>
          <label className="check">
            <input
              type="radio"
              name="quiz-front"
              checked={value.front === 'definition'}
              onChange={() => onChange({ ...value, front: 'definition' })}
            />
            定義 ( 用語を選ぶ )
          </label>
        </div>
      </fieldset>
    </div>
  )
}
