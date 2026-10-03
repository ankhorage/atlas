import type { SourceGraph } from '@ankhorage/dependency-graph';
import { describe, expect, it } from '@artiphishle/testosterone';

import { evaluateAuditRules } from '@/features/audit/domain/evaluateAuditRules';
import { resolveAuditConfiguration } from '@/features/audit/domain/resolveAuditConfiguration';
import type { PackageCycleDetail } from '@/types/audit';

const cycle: PackageCycleDetail = {
  packages: ['a', 'b', 'a'],
  edges: [
    {
      from: 'a',
      to: 'b',
      via: [
        {
          filePath: 'src/a.ts',
          fileClass: 'A',
          importName: 'b',
          isIntrinsic: true,
        },
      ],
    },
  ],
};

describe('[evaluateAuditRules]', () => {
  it('passes cyclic-dependencies with the default blocking policy when no cycle exists', () => {
    const result = evaluateAuditRules({
      configuration: resolveAuditConfiguration(),
      cyclicPackages: [],
      sourceGraph: sourceGraph(false),
    });
    const [presentation] = result.rules;

    expect(presentation.id).toBe('cyclic-dependencies');
    expect(presentation.status).toBe('passed');
    expect(presentation.policy).toBe('blocking');
    expect(presentation.details.length).toBe(0);
    expect(result.genericRules.findings.length).toBe(0);
  });

  it('reports provider-backed package cycles as advisory in audit mode', () => {
    const result = evaluateAuditRules({
      configuration: resolveAuditConfiguration({
        rules: [{ id: 'cyclic-dependencies', mode: 'audit' }],
      }),
      cyclicPackages: [cycle],
      sourceGraph: sourceGraph(true),
    });
    const [presentation] = result.rules;

    expect(presentation.status).toBe('failed');
    expect(presentation.policy).toBe('advisory');
    expect(presentation.details[0]).toBe('a → b → a');
    expect(JSON.stringify(presentation.evidence).includes('src/a.ts')).toBe(true);
    expect(result.genericRules.findings[0]?.ruleId).toBe('cyclic-dependencies');
    expect(JSON.stringify(result.genericRules.findings[0]?.evidence).includes('package')).toBe(
      true
    );
  });

  it('omits disabled rules from generic and presentation evaluation', () => {
    const result = evaluateAuditRules({
      configuration: resolveAuditConfiguration({
        rules: [{ id: 'cyclic-dependencies', mode: 'off' }],
      }),
      cyclicPackages: [cycle],
      sourceGraph: sourceGraph(true),
    });

    expect(result.rules.length).toBe(0);
    expect(result.genericRules.findings.length).toBe(0);
    expect(result.genericRules.diagnostics.length).toBe(0);
  });
});

function sourceGraph(cyclic: boolean): SourceGraph {
  const edges: SourceGraph['graph']['edges'] = [
    relation(0, 2, 0, 'declares-in', 'src/a/A.ts'),
    relation(1, 3, 1, 'declares-in', 'src/b/B.ts'),
    ...(cyclic
      ? [relation(2, 2, 3, 'imports', 'src/a/A.ts'), relation(3, 3, 2, 'imports', 'src/b/B.ts')]
      : []),
  ];
  return {
    version: 1,
    capabilities: [{ analyzerId: 'fixture', projectId: 'fixture', available: ['imports'] }],
    graph: {
      nodes: [
        packageNode(0, 'a'),
        packageNode(1, 'b'),
        fileNode(2, 'src/a/A.ts', 'a'),
        fileNode(3, 'src/b/B.ts', 'b'),
      ],
      edges,
    },
  };
}

function packageNode(id: number, name: string): SourceGraph['graph']['nodes'][number] {
  return {
    id,
    data: {
      kind: 'package',
      semanticPath: `fixture:package:${name}`,
      name,
      projectId: 'fixture',
      packageName: name,
      classification: 'intrinsic',
    },
  };
}

function fileNode(
  id: number,
  path: string,
  packageName: string
): SourceGraph['graph']['nodes'][number] {
  return {
    id,
    data: {
      kind: 'file',
      semanticPath: `fixture:file:${path}`,
      name: path.split('/').at(-1) ?? path,
      projectId: 'fixture',
      path,
      filePath: path,
      packageName,
      classification: 'intrinsic',
    },
  };
}

function relation(
  id: number,
  source: number,
  target: number,
  kind: 'declares-in' | 'imports',
  sourcePath: string
): SourceGraph['graph']['edges'][number] {
  return {
    id,
    source,
    target,
    data: { kind, evidence: [{ analyzerId: 'fixture', sourcePath }] },
  };
}
