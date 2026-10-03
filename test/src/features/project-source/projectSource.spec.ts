import { describe, expect, it } from '@artiphishle/testosterone';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { resolveProjectSourceAsync } from '@/features/project-source/application/use-cases/resolveProjectSourceAsync';

describe('[project source]', () => {
  it('keeps local paths on the filesystem pipeline', async () => {
    const source = parseProjectSource('./project');
    const resolved = await resolveProjectSourceAsync(source, {
      materializeAsync: async () => {
        throw new Error('GitHub must not be called for local sources.');
      },
    });

    expect(source.kind).toBe('filesystem');
    expect(resolved.rootPath.endsWith('/project')).toBe(true);
    await resolved.cleanupAsync();
  });

  it('materializes normal GitHub revision URLs and retains the immutable revision', async () => {
    const source = parseProjectSource('https://github.com/ankhorage/zora/tree/main');
    let cleaned = false;
    const resolved = await resolveProjectSourceAsync(source, {
      materializeAsync: async () => ({
        rootPath: '/tmp/zora',
        projectName: 'zora',
        revision: 'abc123',
        cleanupAsync: async () => {
          cleaned = true;
        },
      }),
    });

    expect(source).toEqual({
      kind: 'github',
      url: 'https://github.com/ankhorage/zora/tree/main',
    });
    expect(resolved.projectName).toBe('zora');
    expect(resolved.revision).toBe('abc123');
    await resolved.cleanupAsync();
    expect(cleaned).toBe(true);
  });

  it('rejects unsupported remote providers', () => {
    expect(() => parseProjectSource('https://gitlab.com/ankhorage/zora')).toThrow(
      'Only local project paths'
    );
  });
});
