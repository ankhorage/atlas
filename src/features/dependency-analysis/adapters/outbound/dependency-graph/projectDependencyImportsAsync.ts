import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DependencyGraph,
  DependencyGraphNodeData,
  DependencyImportEvidence,
} from '@ankhorage/dependency-graph';
import { resolveFileSystemPathWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type { ProjectImportMetadata } from '@/types/projectFiles';

interface OrderedImport {
  readonly definition: ProjectImportMetadata;
  readonly position: number;
  readonly ordinal: number;
}

interface AppendEvidenceInput {
  readonly analysisRoot: string;
  readonly evidence: DependencyImportEvidence;
  readonly importNameMode: ImportNameMode;
  readonly imports: Map<string, OrderedImport[]>;
  readonly intrinsicMode: ImportIntrinsicMode;
  readonly ordinal: number;
  readonly pkg: string;
  readonly projectRoot: string;
  readonly sourceTextByFile: Map<string, Promise<string>>;
}

/*** Project Atlas import metadata from one canonical dependency graph without rescanning source. */
export async function projectDependencyImportsAsync(
  graph: DependencyGraph,
  projectRoot: string,
  analysisRoot: string = projectRoot,
  importNameMode: ImportNameMode = 'package',
  intrinsicMode: ImportIntrinsicMode = 'canonical'
): Promise<ReadonlyMap<string, readonly ProjectImportMetadata[]>> {
  const canonicalProjectRoot = resolveFileSystemPathWithinRoot(projectRoot, '.', {
    allowRoot: true,
  });
  const canonicalAnalysisRoot = resolveFileSystemPathWithinRoot(
    canonicalProjectRoot,
    resolveFileSystemPathWithinRoot(analysisRoot, '.', { allowRoot: true }),
    { allowRoot: true }
  );
  const nodes = new Map(graph.nodes.map(node => [node.id, node.data] as const));
  const imports = new Map<string, OrderedImport[]>();
  const sourceTextByFile = new Map<string, Promise<string>>();
  let ordinal = 0;

  for (const edge of graph.edges) {
    const target = nodes.get(edge.target);
    if (target === undefined) {
      throw new Error(`Missing dependency-graph target node: ${edge.target}`);
    }

    const pkg = targetPackage(target);
    for (const evidence of edge.data.evidence) {
      if (pkg === '') continue;
      ordinal = await appendEvidenceAsync({
        analysisRoot: canonicalAnalysisRoot,
        evidence,
        importNameMode,
        imports,
        intrinsicMode,
        ordinal,
        pkg,
        projectRoot: canonicalProjectRoot,
        sourceTextByFile,
      });
    }
  }

  return materializeImports(imports);
}

type ImportNameMode = 'package' | 'specifier';
type ImportIntrinsicMode =
  'canonical' | 'delphi-standard-library' | 'kotlin-standard-library' | 'python-legacy';

/*** Add one canonical evidence item while retaining the original source declaration position. */
async function appendEvidenceAsync(input: AppendEvidenceInput): Promise<number> {
  const absoluteSourceFile = path.resolve(input.projectRoot, input.evidence.sourceFile);
  const sourceFile = toPortablePath(path.relative(input.analysisRoot, absoluteSourceFile));
  const sourceText = await readSourceTextAsync(input.sourceTextByFile, absoluteSourceFile);
  const current = input.imports.get(sourceFile) ?? [];

  current.push({
    definition: {
      name: input.importNameMode === 'specifier' ? input.evidence.specifier : input.pkg,
      pkg: input.pkg,
      isIntrinsic: isIntrinsicImport(input.evidence, input.intrinsicMode),
    },
    position: sourceText.indexOf(input.evidence.specifier),
    ordinal: input.ordinal,
  });
  input.imports.set(sourceFile, current);
  return input.ordinal + 1;
}

/*** Convert collected import evidence into source-order Atlas definitions. */
function materializeImports(
  imports: ReadonlyMap<string, readonly OrderedImport[]>
): ReadonlyMap<string, readonly ProjectImportMetadata[]> {
  return new Map(
    [...imports].map(([sourceFile, entries]) => [
      sourceFile,
      [...entries]
        .sort((left, right) => {
          const leftPosition = left.position < 0 ? Number.MAX_SAFE_INTEGER : left.position;
          const rightPosition = right.position < 0 ? Number.MAX_SAFE_INTEGER : right.position;
          return leftPosition - rightPosition || left.ordinal - right.ordinal;
        })
        .map(({ definition }) => definition),
    ])
  );
}

/*** Read source content once so adapter output preserves source declaration order. */
function readSourceTextAsync(
  cache: Map<string, Promise<string>>,
  sourceFile: string
): Promise<string> {
  const cached = cache.get(sourceFile);
  if (cached !== undefined) return cached;

  const sourceText = readOptionalSourceTextAsync(sourceFile);
  cache.set(sourceFile, sourceText);
  return sourceText;
}

/*** Keep missing evidence source files in canonical order instead of failing projection. */
async function readOptionalSourceTextAsync(sourceFile: string): Promise<string> {
  try {
    return await readFile(sourceFile, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

/*** Preserve Atlas presentation semantics independently from canonical graph classification. */
function isIntrinsicImport(evidence: DependencyImportEvidence, mode: ImportIntrinsicMode): boolean {
  if (mode === 'canonical') {
    return evidence.classification === 'intrinsic' || evidence.classification === 'focus';
  }
  if (mode === 'python-legacy') return evidence.specifier.startsWith('.');
  if (mode === 'delphi-standard-library') {
    return (
      evidence.specifier.startsWith('System.') ||
      evidence.specifier.startsWith('Vcl.') ||
      evidence.specifier.startsWith('FMX.') ||
      evidence.specifier.startsWith('Data.') ||
      evidence.specifier.startsWith('Web.')
    );
  }

  return (
    evidence.specifier.startsWith('kotlin.') ||
    evidence.specifier.startsWith('java.') ||
    evidence.specifier.startsWith('javax.')
  );
}

/*** Map canonical dependency nodes to the package notation retained in parser metadata. */
function targetPackage(target: DependencyGraphNodeData): string {
  if (target.kind === 'module') return target.path ?? '';
  if (target.classification === 'intrinsic' && target.focus && target.path === '.') return '';
  return target.packageName ?? target.label;
}
