import { resolveFileSystemPathWithinRoot, writeFileWithinRoot } from '@ankhorage/utility/node/fs';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { hasBlockingAuditRuleFailure } from '@/features/audit/domain/hasBlockingAuditRuleFailure';
import type { Audit, AuditMetaInput, ResolveAuditConfigurationInput } from '@/types/audit';

/*** Creates, writes, and evaluates an audit while retaining the artifact on rule failure. */
export async function runAuditAsync(input: RunAuditInput): Promise<RunAuditResult> {
  const audit = await createAuditAsync(input.projectPath, input.configuration, input.meta);
  const body =
    input.artifactFormat === 'csv'
      ? serializeAuditCsv(audit)
      : input.pretty
        ? JSON.stringify(audit, null, 2)
        : JSON.stringify(audit);

  await writeFileWithinRoot({
    rootPath: input.outputRootPath ?? input.projectPath,
    filePath: input.outputPath,
    body: new TextEncoder().encode(body),
    exclusive: false,
  });

  const artifactPath = resolveFileSystemPathWithinRoot(
    input.outputRootPath ?? input.projectPath,
    input.outputPath
  );
  const shouldFail =
    audit.configuration.failOnRuleViolation && hasBlockingAuditRuleFailure(audit.evaluation.rules);

  return {
    audit,
    artifactPath,
    exitCode: shouldFail ? 2 : 0,
  };
}

/*** Serializes the complete Audit as deterministic scalar JSON-pointer rows. */
function serializeAuditCsv(audit: Audit): string {
  const rows = flattenCsvValue(audit, '');
  return ['path,type,value', ...rows.map(row => row.map(escapeCsvField).join(','))].join('\n');
}

/*** Flattens one Audit value without discarding empty containers or scalar types. */
function flattenCsvValue(value: unknown, path: string): readonly CsvRow[] {
  if (value === null) return [[path || '/', 'null', '']];

  if (Array.isArray(value)) {
    if (value.length === 0) return [[path || '/', 'array', '']];
    return value.flatMap((entry, index) => flattenCsvValue(entry, `${path}/${index}`));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    if (entries.length === 0) return [[path || '/', 'object', '']];
    return entries.flatMap(([key, entry]) =>
      flattenCsvValue(entry, `${path}/${escapeJsonPointerSegment(key)}`)
    );
  }

  return [[path || '/', typeof value, serializeCsvPrimitive(value)]];
}

/*** Serializes one non-container Audit value without implicit object coercion. */
function serializeCsvPrimitive(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === undefined) return '';
  throw new Error(`Unsupported Audit CSV value type: ${typeof value}.`);
}

/*** Escapes one JSON-pointer path segment for deterministic CSV paths. */
function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/*** Quotes one CSV field so arbitrary source evidence remains valid CSV. */
function escapeCsvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

interface RunAuditInput {
  readonly projectPath: string;
  readonly outputPath: string;
  readonly outputRootPath?: string;
  readonly pretty: boolean;
  readonly artifactFormat?: 'json' | 'csv';
  readonly configuration?: ResolveAuditConfigurationInput;
  readonly meta?: AuditMetaInput;
}

interface RunAuditResult {
  readonly audit: Audit;
  readonly artifactPath: string;
  readonly exitCode: 0 | 2;
}

type CsvRow = readonly [path: string, type: string, value: string];
