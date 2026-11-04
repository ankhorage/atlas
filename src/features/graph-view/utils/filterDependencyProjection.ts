import type {
  DependencyDeclarationKind,
  DependencyImportEvidence,
} from '@ankhorage/dependency-graph';
import type { EdgeDefinition, ElementsDefinition } from 'cytoscape';

import type { DependencyFilterKind } from '@/types/settings';

/***
 * Filters dependency edges from canonical import evidence while leaving graph nodes and their
 * navigation identities intact. Evidence without declaration metadata remains visible because its
 * source/module relationship is real but cannot truthfully be assigned a dependency kind.
 */
export function filterDependencyProjection(
  elements: ElementsDefinition,
  input: DependencyProjectionFilter
): ElementsDefinition {
  const packageNames = new Map(
    elements.nodes.flatMap(node =>
      typeof node.data.id === 'string' && typeof node.data.name === 'string'
        ? [[node.data.id, node.data.name] as const]
        : []
    )
  );
  const prefix = input.packagePrefix.trim();

  return {
    nodes: elements.nodes,
    edges: elements.edges.flatMap(edge => {
      const target = typeof edge.data.target === 'string' ? edge.data.target : '';
      const packageName = packageNames.get(target);
      if (prefix && !packageName?.startsWith(prefix)) return [];

      const evidence = readEvidence(edge);
      if (evidence === null) return [edge];
      const visibleEvidence = evidence.flatMap(item => filterEvidence(item, input.enabledKinds));
      return visibleEvidence.length === 0
        ? []
        : [
            {
              ...edge,
              data: { ...edge.data, evidence: visibleEvidence, weight: visibleEvidence.length },
            },
          ];
    }),
  };
}

export interface DependencyProjectionFilter {
  readonly enabledKinds: ReadonlySet<DependencyFilterKind>;
  readonly packagePrefix: string;
}

/*** Retains an import exactly when its supported declaration evidence remains enabled. */
function filterEvidence(
  evidence: DependencyImportEvidence,
  enabledKinds: ReadonlySet<DependencyFilterKind>
): readonly DependencyImportEvidence[] {
  if (evidence.declarations.length === 0) return [evidence];
  const declarations = evidence.declarations.filter(declaration =>
    enabledKinds.has(declaration.kind)
  );
  return declarations.length === 0 ? [] : [{ ...evidence, declarations }];
}

/*** Reads owner-provided import evidence without treating malformed presentation data as evidence. */
function readEvidence(edge: EdgeDefinition): readonly DependencyImportEvidence[] | null {
  const value = (edge.data as Readonly<Record<string, unknown>>).evidence;
  if (!Array.isArray(value)) return null;
  return value.filter(isDependencyImportEvidence);
}

/*** Narrows serializable Cytoscape edge metadata back to the published evidence contract. */
function isDependencyImportEvidence(value: unknown): value is DependencyImportEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const evidence = value as Partial<DependencyImportEvidence>;
  return (
    typeof evidence.sourceFile === 'string' &&
    typeof evidence.specifier === 'string' &&
    Array.isArray(evidence.declarations) &&
    evidence.declarations.every(isDependencyDeclaration)
  );
}

/*** Narrows evidence declarations to the released dependency-graph contract. */
function isDependencyDeclaration(
  value: unknown
): value is { readonly kind: DependencyDeclarationKind; readonly range: string } {
  if (typeof value !== 'object' || value === null) return false;
  const declaration = value as { readonly kind?: unknown; readonly range?: unknown };
  return (
    (declaration.kind === 'dependency' ||
      declaration.kind === 'devDependency' ||
      declaration.kind === 'peerDependency' ||
      declaration.kind === 'optionalDependency') &&
    typeof declaration.range === 'string'
  );
}
