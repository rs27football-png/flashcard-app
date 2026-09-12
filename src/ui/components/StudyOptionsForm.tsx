import type { StudyOptions } from '../../core/types'
import { Toggle } from './Toggle'

interface StudyOptionsFormProps {
  value: StudyOptions
  onChange: (options: StudyOptions) => void
  /** ★を付けたカードが1枚もない場合に「★のみ」を選ばせないため */
  starredCount: number
  /** ラジオの name が画面内で衝突しないようにする */
  idPrefix?: string
}

/** 学習オプションの入力欄 (specs.md §2.7). 開始前の確認と, 暗記モード中の変更で共用する */
export function StudyOptionsForm({
  value,
  onChange,
  starredCount,
  idPrefix = 'study',
}: StudyOptionsFormProps) {
  return (
    <div className="options">
      <Toggle
        label="進み具合を把握する"
        description="判定を保存し、習得済を次から出さない"
        checked={value.trackProgress}
        onChange={(checked) => onChange({ ...value, trackProgress: checked })}
      />
      <Toggle
        label="★を付けたカードのみ"
        description={starredCount === 0 ? '★付きのカードがありません' : `${starredCount} 枚`}
        checked={value.starredOnly}
        disabled={starredCount === 0}
        onChange={(checked) => onChange({ ...value, starredOnly: checked })}
      />
      <Toggle
        label="シャッフル"
        description="並び順を毎回入れ替える"
        checked={value.shuffle}
        onChange={(checked) => onChange({ ...value, shuffle: checked })}
      />

      <fieldset className="fieldset">
        <legend className="field__label">表面に出す側</legend>
        <div className="radios">
          <label className="check">
            <input
              type="radio"
              name={`${idPrefix}-front`}
              checked={value.front === 'term'}
              onChange={() => onChange({ ...value, front: 'term' })}
            />
            用語
          </label>
          <label className="check">
            <input
              type="radio"
              name={`${idPrefix}-front`}
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
