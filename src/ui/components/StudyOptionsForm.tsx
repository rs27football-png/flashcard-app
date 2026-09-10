import type { StudyOptions } from '../../core/types'

interface StudyOptionsFormProps {
  value: StudyOptions
  onChange: (options: StudyOptions) => void
  /** ★を付けたカードが1枚もない場合に「★のみ」を選ばせないため */
  starredCount: number
}

/** 学習オプションの入力欄 ( specs.md §2.7 ). 暗記モードと4択モードで共用する */
export function StudyOptionsForm({ value, onChange, starredCount }: StudyOptionsFormProps) {
  return (
    <div className="form">
      <label className="check check--block">
        <input
          type="checkbox"
          checked={value.trackProgress}
          onChange={(event) => onChange({ ...value, trackProgress: event.target.checked })}
        />
        進み具合を把握する ( 判定を保存し, 習得済を次から出さない )
      </label>

      <label className="check check--block">
        <input
          type="checkbox"
          checked={value.starredOnly}
          disabled={starredCount === 0}
          onChange={(event) => onChange({ ...value, starredOnly: event.target.checked })}
        />
        ★を付けたカードのみ
        {starredCount === 0 ? ' ( ★付きのカードがありません )' : ` ( ${starredCount} 枚 )`}
      </label>

      <label className="check check--block">
        <input
          type="checkbox"
          checked={value.shuffle}
          onChange={(event) => onChange({ ...value, shuffle: event.target.checked })}
        />
        並び順をシャッフルする
      </label>

      <fieldset className="fieldset">
        <legend className="field__label">表面に出す側</legend>
        <div className="radios">
          <label className="check">
            <input
              type="radio"
              name="study-front"
              checked={value.front === 'term'}
              onChange={() => onChange({ ...value, front: 'term' })}
            />
            用語
          </label>
          <label className="check">
            <input
              type="radio"
              name="study-front"
              checked={value.front === 'definition'}
              onChange={() => onChange({ ...value, front: 'definition' })}
            />
            定義
          </label>
        </div>
      </fieldset>
    </div>
  )
}
