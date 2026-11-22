import { parseHexColorOrThrow } from '@ankhorage/color-theory';

/*** Defines the shared repository graph color roles used by the picker and paint-only graph styles. */
export const repositoryColor = {
  border: '#496477',
  default: parseHexColorOrThrow('#DCEAFB'),
  text: '#102033',
} as const;
