import { assert, describe, it } from '@artiphishle/testosterone';

import { createProjectSnapshotReader } from '@/features/project-analysis/application/use-cases/createProjectSnapshotReader';
import { Language } from '@/types/language';
import type { ProjectSnapshot } from '@/types/projectAnalysis';

describe('[project snapshot reader]', () => {
  it('shares concurrent work for one path and discards the settled snapshot', async () => {
    const first = Promise.withResolvers<ProjectSnapshot>();
    const snapshots = [first.promise, Promise.resolve(snapshot('/project', 2))];
    const reads: string[] = [];
    const reader = createProjectSnapshotReader({
      readAsync: projectPath => {
        reads.push(projectPath);
        return snapshots[reads.length - 1] ?? Promise.resolve(snapshot(projectPath, reads.length));
      },
    });

    const left = reader.readAsync('/project');
    const right = reader.readAsync('/project');
    await Promise.resolve();

    assert.equal(left, right);
    assert.deepEqual(reads, ['/project']);
    first.resolve(snapshot('/project', 1));
    assert.equal((await left).timeStart, 1);
    assert.equal((await reader.readAsync('/project')).timeStart, 2);
    assert.deepEqual(reads, ['/project', '/project']);
  });

  it('isolates paths and permits a retry after failure', async () => {
    const attempts = new Map<string, number>();
    const reader = createProjectSnapshotReader({
      readAsync: projectPath => {
        const attempt = (attempts.get(projectPath) ?? 0) + 1;
        attempts.set(projectPath, attempt);
        if (projectPath === '/broken' && attempt === 1) throw new Error('temporary failure');
        return Promise.resolve(snapshot(projectPath, attempt));
      },
    });

    await assert.rejects(reader.readAsync('/broken'), /temporary failure/);
    const [retry, other] = await Promise.all([
      reader.readAsync('/broken'),
      reader.readAsync('/other'),
    ]);

    assert.equal(retry.timeStart, 2);
    assert.equal(other.projectPath, '/other');
    assert.equal(attempts.get('/broken'), 2);
    assert.equal(attempts.get('/other'), 1);
  });
});

function snapshot(projectPath: string, timeStart: number): ProjectSnapshot {
  return {
    files: {},
    packageGraph: { edges: [], nodes: [] },
    sourceGraph: { capabilities: [], graph: { edges: [], nodes: [] }, version: 1 },
    language: {
      candidates: [],
      indicators: [],
      language: Language.TypeScript,
      score: 1,
    },
    projectPath,
    timeStart,
  };
}
