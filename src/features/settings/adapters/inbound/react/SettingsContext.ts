import { createContext } from 'react';

import type { SettingsContextValue } from '@/types/settings';

/*** Owns the React context boundary for persisted Atlas settings. */
export const SettingsContext = createContext<SettingsContextValue | null>(null);
