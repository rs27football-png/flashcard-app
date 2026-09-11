/**
 * アイコン ( specs.md §6.4 ).
 *
 * 外部のアイコンフォントや CDN を使わず SVG を同梱する. オフラインで動くこと,
 * 端末の絵文字の字形に左右されないこと, currentColor で配色に追随できることを優先した.
 * 線は 24x24 の座標系, 太さ2で統一している.
 */

export type IconName =
  | 'settings'
  | 'edit'
  | 'import'
  | 'folder'
  | 'folder-plus'
  | 'set'
  | 'set-plus'
  | 'grip'
  | 'star'
  | 'chevron-right'
  | 'chevron-down'
  | 'undo'
  | 'shuffle'
  | 'check'
  | 'close'
  | 'trash'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'arrow-up'
  | 'arrow-down'
  | 'sort'
  | 'lightbulb'
  | 'more'
  | 'home'
  | 'quiz'

/** 塗りではなく線で描くため, すべて d 属性のみで表せる */
const PATHS: Record<IconName, string> = {
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
  import: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  'folder-plus':
    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z M12 11v6 M9 14h6',
  set: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  'set-plus':
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z M12 7v6 M9 10h6',
  grip: 'M9 5h.01 M9 12h.01 M9 19h.01 M15 5h.01 M15 12h.01 M15 19h.01',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  undo: 'M3 7v6h6 M3.51 13a9 9 0 1 0 2.13-9.36L3 7',
  shuffle: 'M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18 M6 6l12 12',
  trash: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  play: 'M5 3l14 9-14 9z',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  'arrow-up': 'M12 19V5 M5 12l7-7 7 7',
  'arrow-down': 'M12 5v14 M19 12l-7 7-7-7',
  sort: 'M11 5h10 M11 9h7 M11 13h4 M3 17l3 3 3-3 M6 4v16',
  lightbulb: 'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  more: 'M12 12h.01 M19 12h.01 M5 12h.01',
  home: 'M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M9 21v-7h6v7',
  quiz: 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
}

/** 点で表すアイコンは線端を丸めた極短線として描くため, 単独で塗りを持たせる */
const FILLED: ReadonlySet<IconName> = new Set<IconName>(['play'])

interface IconProps {
  name: IconName
  /** 文字サイズに対する倍率. 既定は 1em 相当 */
  size?: number
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={FILLED.has(name) ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // 意味は隣接する文言が伝えるため, 支援技術からは隠す
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
