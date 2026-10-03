import { describe, expect, it } from '@artiphishle/testosterone';

import { resolveProjectTreeNavigation } from '@/features/project-tree/application/use-cases/resolveProjectTreeNavigation';

describe('[project tree navigation]', () => {
  const graph = ['a', 'a.b', 'a.b.child', 'a.bc', 'elsewhere'];

  it('navigates into the exact folder scope and supports upward folder navigation', () => {
    expect(
      resolveProjectTreeNavigation(
        { id: 'directory:a/b', kind: 'directory', label: 'b', graphPackage: 'a/b' },
        graph,
        'elsewhere'
      )
    ).toBe('a.b');
    expect(
      resolveProjectTreeNavigation(
        { id: 'directory:a', kind: 'directory', label: 'a', graphPackage: 'a' },
        graph,
        'a.b'
      )
    ).toBe('a');
  });

  it('does not confuse sibling prefixes when resolving the exact folder path', () => {
    expect(
      resolveProjectTreeNavigation(
        { id: 'directory:a/b', kind: 'directory', label: 'b', graphPackage: 'a/b' },
        ['a.bc', 'a.b'],
        'elsewhere'
      )
    ).toBe('a.b');
  });

  it('preserves the current graph for files and unmapped folders', () => {
    for (const graphPackage of ['a.bc', 'a.b.child', '', 'missing']) {
      expect(
        resolveProjectTreeNavigation(
          { id: 'file:entry', kind: 'file', label: 'entry', graphPackage },
          graph,
          'a.b'
        )
      ).toBe('a.b');
    }
    expect(
      resolveProjectTreeNavigation(
        { id: 'directory:entry', kind: 'directory', label: 'entry', graphPackage: 'a' },
        [],
        'elsewhere'
      )
    ).toBe('elsewhere');
  });
});
