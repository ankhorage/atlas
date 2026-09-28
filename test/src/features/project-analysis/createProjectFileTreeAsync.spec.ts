import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, resolve } from '@artiphishle/testosterone';

import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';
import type { ProjectFileTree } from '@/types/projectFiles';

describe('[project file tree]', () => {
  it('reads Java file metadata recursively', async () => {
    const snapshot = await readProjectSnapshotAsync({
      projectPath: resolve(process.cwd(), 'examples/java/my-app'),
    });
    const comExampleMyapp = ((snapshot.files.com as ProjectFileTree).example as ProjectFileTree)
      .myapp as ProjectFileTree;
    const comExampleMyappA = comExampleMyapp.a as ProjectFileTree;
    const comExampleMyappB = comExampleMyapp.b as ProjectFileTree;
    const comExampleMyappC = comExampleMyapp.c as ProjectFileTree;
    const comExampleMyappD = comExampleMyapp.d as ProjectFileTree;

    expect(comExampleMyapp['App.java'].className).toBe('App');
    expect(comExampleMyappA['A.java'].className).toBe('A');
    expect(comExampleMyappB['B.java'].className).toBe('B');
    expect(comExampleMyappC['C.java'].className).toBe('C');
    expect(comExampleMyappD['D.java'].className).toBe('D');
  });

  it('preserves empty source directories from the canonical inspection inventory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgviz-empty-directory-'));

    try {
      await mkdir(join(root, 'src', 'empty'), { recursive: true });
      await writeFile(join(root, 'src', 'main.py'), 'VALUE = 1\n');

      const snapshot = await readProjectSnapshotAsync({ projectPath: root });
      const emptyDirectory = snapshot.files.empty as ProjectFileTree;

      expect(Object.prototype.hasOwnProperty.call(snapshot.files, 'empty')).toBe(true);
      expect(Object.getPrototypeOf(emptyDirectory)).toBe(null);
      expect(Object.keys(emptyDirectory)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves __proto__ directories as own keys without prototype pollution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgviz-prototype-'));

    try {
      await mkdir(join(root, 'src', '__proto__'), { recursive: true });
      await writeFile(join(root, 'src', '__proto__', 'module.py'), 'VALUE = 1\n');

      const snapshot = await readProjectSnapshotAsync({ projectPath: root });
      const protoDirectory = snapshot.files['__proto__'] as ProjectFileTree;

      expect(Object.getPrototypeOf(snapshot.files)).toBe(null);
      expect(Object.prototype.hasOwnProperty.call(snapshot.files, '__proto__')).toBe(true);
      expect(Object.getPrototypeOf(protoDirectory)).toBe(null);
      expect(Object.prototype.hasOwnProperty.call(protoDirectory, 'module.py')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
