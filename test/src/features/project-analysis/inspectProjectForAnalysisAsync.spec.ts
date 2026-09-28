import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, it } from '@artiphishle/testosterone';

import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { selectParserLanguage } from '@/features/project-analysis/application/use-cases/selectParserLanguage';
import { Language } from '@/types/language';

it('inspects nested source files and prunes dependencies and examples', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pkgviz-detector-'));
  try {
    await mkdir(join(root, 'src/deep/nested/module'), { recursive: true });
    await writeFile(join(root, 'src/deep/nested/module/main.kt'), '');
    await mkdir(join(root, 'node_modules/example'), { recursive: true });
    await writeFile(join(root, 'node_modules/example/main.ts'), '');
    await mkdir(join(root, 'examples'), { recursive: true });
    await writeFile(join(root, 'examples/main.ts'), '');

    const result = selectParserLanguage((await inspectProjectForAnalysisAsync(root)).detection);

    assert.equal(result.language, Language.Kotlin);
    assert.deepEqual(result.indicators, ['src/deep/nested/module/main.kt']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('prunes conventional test sources before production analysis', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pkgviz-detector-'));
  try {
    await mkdir(join(root, 'src/nested'), { recursive: true });
    await mkdir(join(root, 'tests'), { recursive: true });
    await mkdir(join(root, 'src/__tests__'), { recursive: true });
    await writeFile(join(root, 'src/main.ts'), '');
    await writeFile(join(root, 'src/main.test.ts'), '');
    await writeFile(join(root, 'src/nested/widget.spec.ts'), '');
    await writeFile(join(root, 'src/nested/service_test.py'), '');
    await writeFile(join(root, 'src/nested/test_adapter.py'), '');
    await writeFile(join(root, 'tests/integration.ts'), '');
    await writeFile(join(root, 'src/__tests__/unit.ts'), '');

    const inspection = await inspectProjectForAnalysisAsync(root);

    assert.deepEqual(inspection.files, ['src/main.ts']);
    const result = selectParserLanguage(inspection.detection);
    assert.equal(result.language, Language.TypeScript);
    assert.deepEqual(result.indicators, ['src/main.ts']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('reports incomplete scans rather than treating partial evidence as complete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pkgviz-detector-'));
  try {
    await writeFile(join(root, 'main.ts'), '');
    await symlink(join(root, 'main.ts'), join(root, 'linked.ts'));
    await assert.rejects(inspectProjectForAnalysisAsync(root), /inspection is incomplete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('forwards generic path-scope exclusions to Project Detector', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pkgviz-detector-'));
  try {
    await writeFile(join(root, 'main.ts'), '');
    await symlink(join(root, 'main.ts'), join(root, 'excluded-link'));

    const inspection = await inspectProjectForAnalysisAsync(root, {
      excludePaths: ['excluded-link'],
    });

    assert.deepEqual(inspection.files, ['main.ts']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('ignores the generated ZORA runtime directory during project inspection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pkgviz-detector-'));
  try {
    await writeFile(join(root, 'main.ts'), '');
    await mkdir(join(root, '.ankh/zora'), { recursive: true });
    await symlink(root, join(root, '.ankh/zora/web'));

    const result = selectParserLanguage((await inspectProjectForAnalysisAsync(root)).detection);
    assert.equal(result.language, Language.TypeScript);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('normalizes an unavailable inspection root to a project path error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pkgviz-missing-'));
  await rm(root, { recursive: true, force: true });

  await assert.rejects(
    inspectProjectForAnalysisAsync(root),
    new RegExp(`Invalid or unavailable project path: ${root}`)
  );
});
