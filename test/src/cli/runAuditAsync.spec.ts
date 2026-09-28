import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'node:test';
import { describe, expect, it, resolve } from '@artiphishle/testosterone';

import { runAuditAsync } from '@/cli/runAuditAsync';
import type { Audit } from '@/types/audit';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true }))
  );
});

describe('[runAuditAsync]', () => {
  it('writes the artifact before returning the default blocking-rule exit code', async () => {
    const projectPath = await copyFixtureAsync('examples/java/my-app');
    const result = await runAuditAsync({
      projectPath,
      outputPath: 'audit.json',
      pretty: true,
    });
    const persisted = JSON.parse(await readFile(result.artifactPath, 'utf8')) as Audit;

    expect(result.exitCode).toBe(2);
    expect(persisted.configuration.failOnRuleViolation).toBe(true);
    expect(persisted.configuration.rules[0].mode).toBe('block');
    expect(persisted.evaluation.rules[0].status).toBe('failed');
  });

  it('can keep a blocking finding in the audit without failing the process', async () => {
    const projectPath = await copyFixtureAsync('examples/java/my-app');
    const result = await runAuditAsync({
      projectPath,
      outputPath: 'audit.json',
      pretty: true,
      configuration: { failOnRuleViolation: false },
    });

    expect(result.exitCode).toBe(0);
    expect(result.audit.configuration.rules[0].mode).toBe('block');
    expect(result.audit.evaluation.rules[0].policy).toBe('blocking');
    expect(result.audit.evaluation.rules[0].status).toBe('failed');
  });

  it('can downgrade cyclic-dependencies to audit-only', async () => {
    const projectPath = await copyFixtureAsync('examples/java/my-app');
    const result = await runAuditAsync({
      projectPath,
      outputPath: 'audit.json',
      pretty: false,
      configuration: {
        rules: [{ id: 'cyclic-dependencies', mode: 'audit' }],
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.audit.evaluation.rules[0].policy).toBe('advisory');
    expect(result.audit.evaluation.rules[0].status).toBe('failed');
  });

  it('can disable cyclic-dependencies while retaining raw cycle evidence', async () => {
    const projectPath = await copyFixtureAsync('examples/java/my-app');
    const result = await runAuditAsync({
      projectPath,
      outputPath: 'audit.json',
      pretty: false,
      configuration: {
        rules: [{ id: 'cyclic-dependencies', mode: 'off' }],
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.audit.evaluation.rules.length).toBe(0);
    expect(result.audit.evaluation.cyclicPackages.length).toBe(1);
  });

  it('returns zero for a clean project with the default policy', async () => {
    const projectPath = await copyFixtureAsync('examples/typescript/my-app');
    const result = await runAuditAsync({
      projectPath,
      outputPath: 'audit.json',
      pretty: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.audit.evaluation.rules[0].status).toBe('passed');
  });

  it('writes through a symlinked project root without rejecting its canonical path', async () => {
    const projectPath = await copyFixtureAsync('examples/typescript/my-app');
    const aliasPath = `${projectPath}-alias`;
    temporaryDirectories.push(aliasPath);
    await symlink(projectPath, aliasPath, 'dir');

    const result = await runAuditAsync({
      projectPath: aliasPath,
      outputPath: 'audit.json',
      pretty: false,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(result.artifactPath, 'utf8'))).toBeDefined();
  });

  it('retains Java cycle evidence when the project root is a symbolic link', async () => {
    const projectPath = await copyFixtureAsync('examples/java/my-app');
    const aliasPath = `${projectPath}-alias`;
    temporaryDirectories.push(aliasPath);
    await symlink(projectPath, aliasPath, 'dir');

    const result = await runAuditAsync({
      projectPath: aliasPath,
      outputPath: 'audit.json',
      pretty: false,
    });

    expect(result.exitCode).toBe(2);
    expect(result.audit.evaluation.cyclicPackages.length).toBe(1);
  });

  it('forwards generic inspection scope exclusions through the audit boundary', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'pkgviz-audit-'));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, 'main.ts'), '');
    await symlink(join(projectPath, 'main.ts'), join(projectPath, 'excluded-link'));

    const result = await runAuditAsync({
      projectPath,
      outputPath: 'audit.json',
      pretty: false,
      analysis: { excludePaths: ['excluded-link'] },
    });

    expect(result.exitCode).toBe(0);
  });
});

/*** Copies a repository fixture into an isolated temporary project root. */
async function copyFixtureAsync(relativePath: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), 'pkgviz-audit-'));
  temporaryDirectories.push(destination);
  await cp(resolve(process.cwd(), relativePath), destination, { recursive: true });

  return destination;
}
