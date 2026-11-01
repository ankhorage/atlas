import { createWriteStream } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { assert, describe, expect, it } from '@artiphishle/testosterone';
import { ZipFile } from 'yazl';

import { runAuditSourceAsync } from '@/cli/runAuditSourceAsync';
import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';

const JAVA_SOURCE_FILES = [
  'pom.xml',
  'src/main/java/com/example/myapp/App.java',
  'src/main/java/com/example/myapp/a/A.java',
  'src/main/java/com/example/myapp/b/B.java',
  'src/main/java/com/example/myapp/c/C.java',
  'src/main/java/com/example/myapp/d/D.java',
] as const;

/*** Exercises source JAR input through the source boundary and canonical project-analysis pipeline. */
describe('[source JAR acceptance]', () => {
  it('produces the same Project Detector, Dependency Graph, and Audit result as its extracted source project', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-acceptance-'));
    const projectRoot = join(fixtureRoot, 'my-app');
    const sourceJarPath = join(fixtureRoot, 'my-app-sources.jar');
    await cp(resolve(process.cwd(), 'examples/java/my-app'), projectRoot, { recursive: true });
    await mkdir(join(projectRoot, 'META-INF'));
    await createSourceJarAsync(sourceJarPath, projectRoot);

    const directAudit = await createAuditAsync(projectRoot);
    const localDirectory = await loadProjectSourceAsync({ kind: 'filesystem', path: projectRoot });
    const materialized = await loadProjectSourceAsync({ kind: 'filesystem', path: sourceJarPath });
    try {
      expect(localDirectory.rootPath).toBe(resolve(projectRoot));
      const sourceJarAudit = await createAuditAsync(
        materialized.rootPath,
        {},
        {
          projectName: materialized.projectName,
        }
      );

      expect(sourceJarAudit.files).toEqual(directAudit.files);
      expect(sourceJarAudit.packageGraph).toEqual(directAudit.packageGraph);
      expect(sourceJarAudit.sourceGraph).toEqual(directAudit.sourceGraph);
      expect(sourceJarAudit.evaluation).toEqual(directAudit.evaluation);
    } finally {
      await localDirectory.cleanupAsync();
      await materialized.cleanupAsync();
    }

    await assert.rejects(access(materialized.rootPath));
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('removes a materialized source JAR when the CLI pipeline rejects its output', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-acceptance-'));
    const projectRoot = join(fixtureRoot, 'my-app');
    const sourceJarPath = join(fixtureRoot, 'my-app-sources.jar');
    await cp(resolve(process.cwd(), 'examples/java/my-app'), projectRoot, { recursive: true });
    await createSourceJarAsync(sourceJarPath, projectRoot);

    const existingTemporaryRoots = await readSourceJarTemporaryRootsAsync();
    await assert.rejects(
      runAuditSourceAsync({
        source: sourceJarPath,
        out: '../outside-atlas-output.json',
        open: false,
        pretty: false,
        serve: false,
        prod: false,
        waitMs: 0,
        verbose: false,
        failOnRuleViolation: false,
        help: false,
        rules: [],
      }),
      /escaped the allowed root/
    );
    expect(await readSourceJarTemporaryRootsAsync()).toEqual(existingTemporaryRoots);
    await rm(fixtureRoot, { force: true, recursive: true });
  });
});

/*** Creates a realistic Maven-style source archive with explicit ZIP directory entries. */
async function createSourceJarAsync(sourceJarPath: string, projectRoot: string): Promise<void> {
  const archive = new ZipFile();
  [
    'META-INF/',
    'src/',
    'src/main/',
    'src/main/java/',
    'src/main/java/com/',
    'src/main/java/com/example/',
    'src/main/java/com/example/myapp/',
    'src/main/java/com/example/myapp/a/',
    'src/main/java/com/example/myapp/b/',
    'src/main/java/com/example/myapp/c/',
    'src/main/java/com/example/myapp/d/',
  ].forEach(directory => archive.addEmptyDirectory(directory));
  const sourceEntries = await Promise.all(
    JAVA_SOURCE_FILES.map(
      async sourcePath => [sourcePath, await readFile(join(projectRoot, sourcePath))] as const
    )
  );
  sourceEntries.forEach(([sourcePath, content]) => archive.addBuffer(content, sourcePath));
  archive.end();
  await pipeline(archive.outputStream, createWriteStream(sourceJarPath));
}

/*** Lists only Atlas-owned source-JAR extraction roots to prove error-path cleanup without ambient state. */
async function readSourceJarTemporaryRootsAsync(): Promise<readonly string[]> {
  return (await readdir(tmpdir())).filter(entry => entry.startsWith('atlas-source-jar-')).sort();
}
