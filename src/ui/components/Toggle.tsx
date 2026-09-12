interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** 見出しの下に添える補足 */
  description?: string
  disabled?: boolean
}

/**
 * 2値の設定を表すトグルスイッチ (specs.md §6.4).
 *
 * 見た目だけを差し替えた <input type="checkbox"> である. role="switch" を自前で
 * 組むより, ラベルとの関連付けやキーボード操作をブラウザに任せるほうが穴が少ない.
 */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label className={`toggle ${disabled === true ? 'toggle--disabled' : ''}`}>
      <input
        type="checkbox"
        className="toggle__input"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__knob" />
      </span>
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {description !== undefined && (
          <span className="toggle__description">{description}</span>
        )}
      </span>
    </label>
  )
}
