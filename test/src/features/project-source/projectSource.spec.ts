import { describe, expect, it } from '@artiphishle/testosterone';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { resolveConfiguredProjectSource } from '@/features/project-source/application/use-cases/resolveConfiguredProjectSource';
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

  it('passes normal GitHub URLs through unchanged and retains the immutable revision', async () => {
    const url = 'https://github.com/ankhorage/zora/tree/main';
    const source = parseProjectSource(url);
    let cleaned = false;
    const resolved = await resolveProjectSourceAsync(source, {
      materializeAsync: async materializedSource => {
        expect(materializedSource).toEqual({ kind: 'github', url });
        return {
          rootPath: '/tmp/zora',
          projectName: 'zora',
          revision: 'abc123',
          cleanupAsync: async () => {
            cleaned = true;
          },
        };
      },
    });

    expect(source).toEqual({ kind: 'github', url });
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

  it('uses canonical Ankh precedence for project sources', () => {
    expect(
      resolveConfiguredProjectSource({
        explicit: ' https://github.com/ankhorage/zora/tree/main ',
        cli: './cli-project',
        environment: './env-project',
      })
    ).toEqual({
      origin: 'explicit',
      source: { kind: 'github', url: 'https://github.com/ankhorage/zora/tree/main' },
    });

    expect(
      resolveConfiguredProjectSource({
        explicit: ' ',
        cli: './cli-project',
        environment: './env-project',
      })
    ).toEqual({
      origin: 'cli',
      source: { kind: 'filesystem', path: './cli-project' },
    });

    expect(resolveConfiguredProjectSource({ environment: './env-project' })).toEqual({
      origin: 'environment',
      source: { kind: 'filesystem', path: './env-project' },
    });

    expect(resolveConfiguredProjectSource({})).toEqual({
      origin: 'default',
      source: { kind: 'github', url: 'https://github.com/artiphishle/pkgviz' },
    });
  });
});
