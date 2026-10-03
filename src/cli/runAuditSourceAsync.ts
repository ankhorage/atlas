import { runAuditAsync } from '@/cli/runAuditAsync';
import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import type { PkgvizCliOptions } from '@/types/cli';

/*** Resolve one local or GitHub source, run the canonical audit, and clean transient sources. */
export async function runAuditSourceAsync(options: PkgvizCliOptions) {
  const source = parseProjectSource(options.source ?? process.cwd(), options.ref);
  const resolved = await loadProjectSourceAsync(source);

  try {
    return await runAuditAsync({
      projectPath: resolved.rootPath,
      outputRootPath: process.cwd(),
      outputPath: options.out,
      pretty: options.pretty,
      meta: {
        projectName: resolved.projectName,
        ...(resolved.source.kind === 'github' && resolved.revision !== undefined
          ? {
              source: {
                kind: 'github' as const,
                url: resolved.source.url,
                revision: resolved.revision,
              },
            }
          : {}),
      },
      configuration: {
        ...(options.architectureTarget === undefined
          ? {}
          : { architectureTarget: options.architectureTarget }),
        failOnRuleViolation: options.failOnRuleViolation,
        rules: options.rules,
      },
    });
  } finally {
    await resolved.cleanupAsync();
  }
}
