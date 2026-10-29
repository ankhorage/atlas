import { describe, expect, it, resolve } from '@artiphishle/testosterone';

import { readTypeScriptProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readTypeScriptProjectFileMetadata';
import { parseProjectPath } from '@/utils/parseProjectPath';

describe('[TypeScript: readTypeScriptProjectFileMetadata]', () => {
  it('parses file metadata while preserving canonical dependency imports', async () => {
    process.env.ATLAS_PROJECT_PATH = resolve(process.cwd());
    const projectPath = parseProjectPath();
    const file = resolve(projectPath, 'src/app/page.tsx');
    const imports = [{ name: 'src.screens.home', pkg: 'src.screens.home', isIntrinsic: true }];
    const parsedFile = await readTypeScriptProjectFileMetadata(file, projectPath, imports);

    expect(parsedFile.className).toBe('page.tsx');
    expect(parsedFile.imports).toEqual(imports);
    expect(parsedFile.package).toBe('src.app');
    expect(parsedFile.path).toBe('src/app/page.tsx');
  });
});
