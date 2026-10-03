import type { SourceGraph } from '@ankhorage/dependency-graph';
import { describe, expect, it } from '@artiphishle/testosterone';

import { evaluateArchitectureTarget } from '@/features/audit/domain/evaluateArchitectureTarget';

describe('[evaluateArchitectureTarget]', () => {
  it('does nothing when no target is explicitly configured', () => {
    expect(evaluateArchitectureTarget(sourceGraph(), undefined)).toBeUndefined();
  });

  it('evaluates an explicit model without duplicating target-independent cycle findings', () => {
    const evaluation = evaluateArchitectureTarget(sourceGraph(), {
      kind: 'model',
      id: 'layered',
    });

    expect(evaluation?.target).toEqual({ kind: 'model', id: 'layered' });
    if (evaluation?.target.kind !== 'model') throw new Error('Expected model evaluation.');
    expect(evaluation.result.modelId).toBe('layered');
    expect(evaluation.result.findings.some(({ ruleId }) => ruleId === 'cyclic-dependencies')).toBe(
      false,
    );
  });

  it('evaluates an explicit profile independently from architecture detection', () => {
    const evaluation = evaluateArchitectureTarget(sourceGraph(), {
      kind: 'profile',
      id: 'ankhorage',
    });

    expect(evaluation?.target).toEqual({ kind: 'profile', id: 'ankhorage' });
    if (evaluation?.target.kind !== 'profile') throw new Error('Expected profile evaluation.');
    expect(evaluation.result.profileId).toBe('ankhorage');
  });
});

function sourceGraph(): SourceGraph {
  return {
    version: 1,
    capabilities: [{ analyzerId: 'fixture', projectId: 'fixture', available: ['imports'] }],
    graph: {
      nodes: [
        fileNode(0, 'src/domain/a.ts'),
        fileNode(1, 'src/adapters/b.ts'),
      ],
      edges: [
        importEdge(0, 0, 1, 'src/domain/a.ts'),
        importEdge(1, 1, 0, 'src/adapters/b.ts'),
      ],
    },
  };
}

function fileNode(id: number, path: string): SourceGraph['graph']['nodes'][number] {
  return {
    id,
    data: {
      kind: 'file',
      semanticPath: `fixture:file:${path}`,
      name: path.split('/').at(-1) ?? path,
      projectId: 'fixture',
      path,
      filePath: path,
      classification: 'intrinsic',
    },
  };
}

function importEdge(
  id: number,
  source: number,
  target: number,
  sourcePath: string,
): SourceGraph['graph']['edges'][number] {
  return {
    id,
    source,
    target,
    data: {
      kind: 'imports',
      evidence: [{ analyzerId: 'fixture', sourcePath }],
    },
  };
}
