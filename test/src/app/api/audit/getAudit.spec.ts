import { deserializeSourceGraph } from '@ankhorage/dependency-graph';

import { Language } from '@/types/language';
import type { ProjectFileMetadata } from '@/types/projectFiles';

import { beforeEach } from 'node:test';
import { describe, expect, it, resolve } from '@artiphishle/testosterone';
import { getAuditAction } from '@/app/actions/audit.actions';

describe('[getAuditAction]', () => {
  beforeEach(() => {
    // keep tests deterministic; set path fresh for each test
    process.env.NEXT_PUBLIC_PROJECT_PATH = resolve(process.cwd(), 'examples/java/my-app');
  });

  // Test: Audit output contains 'App.java' which is matched correctly, also audit.meta is correct
  it('generates correct Audit (App.java & meta property)', async () => {
    const audit = await getAuditAction();

    const appJava = {
      className: 'App',
      imports: [
        {
          isIntrinsic: true,
          name: 'com.example.myapp.a.A',
          pkg: 'com.example.myapp.a',
        },
      ],
      package: 'com.example.myapp',
      path: 'com/example/myapp/App.java',
    };

    // any ok. Avoid cyclic type: Java package nesting can contain unknown length of sub packages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditAppJava = (audit.files.com as any).example.myapp['App.java'] as ProjectFileMetadata;

    // audit.files > File 'App.java'
    expect(auditAppJava.className).toBe(appJava.className);

    expect(auditAppJava.imports[0].isIntrinsic).toBe(appJava.imports[0].isIntrinsic);
    expect(auditAppJava.imports[0].name).toBe(appJava.imports[0].name);
    expect(auditAppJava.imports[0].pkg).toBe(appJava.imports[0].pkg);

    expect(auditAppJava.package).toBe(appJava.package);
    expect(auditAppJava.path).toBe(appJava.path);

    // audit.meta
    expect(audit.meta.language.language).toBe(Language.Java);
    expect(audit.meta.projectName).toBe('my-app');
    expect(typeof audit.meta.timeStart).toBe('number');
    expect(typeof audit.meta.timeEnd).toBe('number');

    // Portable viewer data must retain the analyzed dependency graph without rebuilding it from files.
    const packageA = audit.packageGraph.nodes.find(node => node.id === 'com.example.myapp.a');
    expect(packageA?.data.isIntrinsic).toBe(true);

    const appToA = audit.packageGraph.edges.find(
      edge => edge.source === 'com.example.myapp' && edge.target === 'com.example.myapp.a'
    );
    expect(appToA?.data.weight).toBe(1);
    expect(appToA?.data.evidence.length).toBe(1);

    const sourceGraph = deserializeSourceGraph(audit.sourceGraph);
    expect(sourceGraph.graph.nodes.length > 0).toBe(true);
    expect(sourceGraph.capabilities.some(report => report.available.includes('declarations'))).toBe(
      true
    );

    const modelIds = audit.evaluation.architecture.candidates.map(candidate => candidate.modelId);
    expect(modelIds).toContain('hexagonal');
    expect(modelIds).toContain('clean');
    expect(modelIds).toContain('onion');
    expect(modelIds).toContain('layered');

    const serialized = JSON.parse(JSON.stringify(audit)) as typeof audit;
    expect(serialized.packageGraph).toEqual(audit.packageGraph);
    expect(deserializeSourceGraph(serialized.sourceGraph)).toEqual(sourceGraph);

    expect(
      audit.evaluation.genericRules.findings.some(
        finding => finding.ruleId === 'cyclic-dependencies'
      )
    ).toBe(true);

    const cyclicRule = audit.evaluation.rules.find(rule => rule.id === 'cyclic-dependencies');
    expect(cyclicRule?.status).toBe('failed');
    expect(cyclicRule?.policy).toBe('blocking');
    expect(audit.evaluation.cyclicPackages.length).toBe(1);
    expect(JSON.stringify(cyclicRule?.evidence).includes('com.example.myapp.a')).toBe(true);
  });
});
