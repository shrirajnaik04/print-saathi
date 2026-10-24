import type { PassportChoice } from '../../core/job/job';
import { en } from '../../i18n/en';
import { push } from '../types';
import { borderName, sizeName } from './names';

const t = en.passport;

/** The passport rows of the Change hub (kept apart from the passport screens, which load when first opened). */
export function passportRows(jobId: string, passport: PassportChoice) {
  return [
    { label: t.count, value: String(passport.count), to: push('passportcount', { jobId }) },
    { label: t.size, value: sizeName(passport.preset, passport.sizeMm), to: push('passportsize', { jobId }) },
    { label: t.border, value: borderName(passport.border), to: push('passportborder', { jobId }) },
    { label: t.frame, value: t.frameValue, to: push('passportcrop', { jobId, from: 'change' }) },
  ];
}
