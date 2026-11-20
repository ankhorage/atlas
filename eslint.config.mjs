import { createConfig } from '@ankhorage/devtools/eslint';
import localConfig from './eslint.local.config.mjs';

const localEntries = Array.isArray(localConfig) ? localConfig : [localConfig];

export default [
  ...createConfig({
    files: [
      'src/**/*.{ts,tsx}',
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'worker/**/*.{ts,tsx}',
      'scripts/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
    ],
    javascriptFiles: [
      'src/**/*.{js,mjs,cjs}',
      'app/**/*.{js,mjs,cjs}',
      'components/**/*.{js,mjs,cjs}',
      'lib/**/*.{js,mjs,cjs}',
      'worker/**/*.{js,mjs,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      'tests/**/*.{js,mjs,cjs}',
    ],
    project: ['./tsconfig.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  ...localEntries,
];
