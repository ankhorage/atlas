import type { DetectedLanguage } from '@ankhorage/project-detector/types';

import type { Language } from '@/types/language';

/** atlas's parser choice, not a generic project's single language or a probability. */
export interface ParserSelection {
  readonly language: Language;
  readonly score: number;
  readonly indicators: readonly string[];
  readonly candidates: readonly DetectedLanguage[];
}
