// Phosphor bold icons (MIT, @phosphor-icons/core 2.1.1), bundled as raw SVG: ~0.2–2 KB each, no icon font.
// Always shown next to a text label (PLAN §H1); the SVGs use currentColor so they follow the tokens.

import turnSvg from '@phosphor-icons/core/assets/bold/arrow-clockwise-bold.svg?raw';
import undoSvg from '@phosphor-icons/core/assets/bold/arrow-counter-clockwise-bold.svg?raw';
import laterSvg from '@phosphor-icons/core/assets/bold/arrow-down-bold.svg?raw';
import leftSvg from '@phosphor-icons/core/assets/bold/arrow-left-bold.svg?raw';
import rightSvg from '@phosphor-icons/core/assets/bold/arrow-right-bold.svg?raw';
import nextSvg from '@phosphor-icons/core/assets/bold/arrow-right-bold.svg?raw';
import earlierSvg from '@phosphor-icons/core/assets/bold/arrow-up-bold.svg?raw';
import backSvg from '@phosphor-icons/core/assets/bold/caret-left-bold.svg?raw';
import checkSvg from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';
import recentSvg from '@phosphor-icons/core/assets/bold/clock-counter-clockwise-bold.svg?raw';
import cardSvg from '@phosphor-icons/core/assets/bold/credit-card-bold.svg?raw';
import cropSvg from '@phosphor-icons/core/assets/bold/crop-bold.svg?raw';
import documentSvg from '@phosphor-icons/core/assets/bold/file-text-bold.svg?raw';
import filesSvg from '@phosphor-icons/core/assets/bold/files-bold.svg?raw';
import settingsSvg from '@phosphor-icons/core/assets/bold/gear-bold.svg?raw';
import homeSvg from '@phosphor-icons/core/assets/bold/house-bold.svg?raw';
import passportSvg from '@phosphor-icons/core/assets/bold/identification-card-bold.svg?raw';
import photosSvg from '@phosphor-icons/core/assets/bold/images-bold.svg?raw';
import infoSvg from '@phosphor-icons/core/assets/bold/info-bold.svg?raw';
import minusSvg from '@phosphor-icons/core/assets/bold/minus-bold.svg?raw';
import plusSvg from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
import printSvg from '@phosphor-icons/core/assets/bold/printer-bold.svg?raw';
import helpSvg from '@phosphor-icons/core/assets/bold/question-bold.svg?raw';
import shareSvg from '@phosphor-icons/core/assets/bold/share-network-bold.svg?raw';
import removeSvg from '@phosphor-icons/core/assets/bold/trash-bold.svg?raw';
import warningSvg from '@phosphor-icons/core/assets/bold/warning-bold.svg?raw';
import errorSvg from '@phosphor-icons/core/assets/bold/warning-circle-bold.svg?raw';

export const ICONS = {
  photos: photosSvg,
  passport: passportSvg,
  document: documentSvg,
  print: printSvg,
  back: backSvg,
  home: homeSvg,
  warning: warningSvg,
  error: errorSvg,
  info: infoSvg,
  settings: settingsSvg,
  help: helpSvg,
  recent: recentSvg,
  minus: minusSvg,
  plus: plusSvg,
  check: checkSvg,
  share: shareSvg,
  next: nextSvg,
  files: filesSvg,
  turn: turnSvg,
  crop: cropSvg,
  undo: undoSvg,
  earlier: earlierSvg,
  up: earlierSvg,
  down: laterSvg,
  left: leftSvg,
  right: rightSvg,
  later: laterSvg,
  remove: removeSvg,
  card: cardSvg,
} as const;

export type IconName = keyof typeof ICONS;
