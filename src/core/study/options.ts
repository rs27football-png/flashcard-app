import type { StudyOptions } from '../types'

/** 学習オプションの既定値 ( specs.md §2.7 ) */
export const DEFAULT_STUDY_OPTIONS: StudyOptions = {
  trackProgress: true,
  starredOnly: false,
  front: 'term',
  shuffle: false,
}

/**
 * 保存されている値を StudyOptions として読み直す.
 *
 * studyOptions は v3.3 で追加した項目である. それ以前に作られたセットには
 * 存在しないため, 欠けている項目を既定値で補ってから使う.
 */
export function normalizeStudyOptions(value: Partial<StudyOptions> | undefined): StudyOptions {
  return { ...DEFAULT_STUDY_OPTIONS, ...value }
}
