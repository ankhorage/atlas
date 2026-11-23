import {
  createSourceFeatureProjectionIndex,
  createSourceGraphIndex,
  findSourceNode,
  listSourceFeatureMembers,
  listSourceFeatures,
  projectSourceFeatures,
  type SourceFeature,
  type SourceFeatureMember,
  type SourceGraph,
} from '@ankhorage/dependency-graph';

import type { ProjectTreeNode } from '@/types/projectTree';

const SOURCE_FEATURE_PAGE_LIMIT = 1000;

/** Adds only analyzer-proven feature members to their established package rows. */
export function addSourceFeatureNavigation(
  tree: readonly ProjectTreeNode[],
  sourceGraph: SourceGraph
): readonly ProjectTreeNode[] {
  const projection = projectSourceFeatures(sourceGraph);
  const featureIndex = createSourceFeatureProjectionIndex(projection);
  const sourceIndex = createSourceGraphIndex(sourceGraph);
  const featuresByPackage = collectFeaturesByPackage(
    listAllFeatures(featureIndex),
    featureIndex,
    sourceIndex
  );
  const unavailableProjectIds = new Set(
    projection.capabilities
      .filter(capability => capability.state === 'unavailable')
      .map(capability => capability.projectId)
  );
  const decorated = addFeaturesToPackages(tree, featuresByPackage);
  return unavailableProjectIds.size === 0
    ? decorated
    : [
        ...decorated,
        ...[...unavailableProjectIds]
          .sort()
          .map(projectId => unavailableFeatureEvidenceNode(projectId)),
      ];
}

/** Reads the whole deterministic projection through its bounded published query API. */
function listAllFeatures(
  index: ReturnType<typeof createSourceFeatureProjectionIndex>
): readonly SourceFeature[] {
  return listAllPages(cursor =>
    listSourceFeatures(index, { cursor, limit: SOURCE_FEATURE_PAGE_LIMIT })
  );
}

/** Associates feature members only with packages recorded on their canonical declaration nodes. */
function collectFeaturesByPackage(
  features: readonly SourceFeature[],
  featureIndex: ReturnType<typeof createSourceFeatureProjectionIndex>,
  sourceIndex: ReturnType<typeof createSourceGraphIndex>
): ReadonlyMap<string, readonly FeatureNavigation[]> {
  const result = new Map<string, FeatureNavigation[]>();
  for (const feature of features) {
    const members = listAllPages(cursor =>
      listSourceFeatureMembers(featureIndex, feature.id, {
        cursor,
        limit: SOURCE_FEATURE_PAGE_LIMIT,
      })
    );
    for (const member of members) {
      const sourceNode = findSourceNode(sourceIndex, member.semanticPath);
      const packageName = sourceNode?.data.packageName;
      if (packageName === undefined || sourceNode === undefined) continue;
      const featureByPackage = result.get(packageName) ?? [];
      const existing = featureByPackage.find(candidate => candidate.id === feature.id);
      const component = { label: sourceNode.data.name, member };
      if (existing === undefined) {
        result.set(packageName, [
          ...featureByPackage,
          { id: feature.id, members: [component], name: feature.name, packageName },
        ]);
      } else {
        result.set(
          packageName,
          featureByPackage.map(candidate =>
            candidate.id === feature.id
              ? { ...candidate, members: [...candidate.members, component] }
              : candidate
          )
        );
      }
    }
  }
  return new Map(
    [...result].map(([packageName, features]) => [
      packageName,
      features
        .map(feature => ({
          ...feature,
          members: feature.members.toSorted(compareComponent),
        }))
        .toSorted(compareFeature),
    ])
  );
}

/** Decorates only the deepest existing package row, preserving filesystem-tree selection behavior. */
function addFeaturesToPackages(
  nodes: readonly ProjectTreeNode[],
  featuresByPackage: ReadonlyMap<string, readonly FeatureNavigation[]>
): readonly ProjectTreeNode[] {
  return nodes.map(node => {
    const children =
      node.children === undefined
        ? undefined
        : addFeaturesToPackages(node.children, featuresByPackage);
    const features = isDeepestPackageNode({
      ...node,
      ...(children === undefined ? {} : { children }),
    })
      ? featuresByPackage.get(node.graphPackage)
      : undefined;
    const decoratedChildren =
      features === undefined ? children : [...(children ?? []), ...features.map(featureNode)];
    return {
      ...node,
      ...(decoratedChildren === undefined ? {} : { children: decoratedChildren }),
    };
  });
}

/** Prevents inherited directory package labels from duplicating the same feature in ancestor rows. */
function isDeepestPackageNode(node: ProjectTreeNode): boolean {
  return (
    node.kind === 'directory' &&
    node.graphPackage.length > 0 &&
    !(node.children ?? []).some(
      child => child.kind === 'directory' && child.graphPackage === node.graphPackage
    )
  );
}

/** Materializes one feature and its evidence-backed component or module rows. */
function featureNode(feature: FeatureNavigation): ProjectTreeNode {
  return {
    children: feature.members.map(component => ({
      graphPackage: feature.packageName,
      id: `feature-member:${feature.id}:${component.member.semanticPath}`,
      kind: 'virtual',
      label: component.label,
      sourceEvidence: {
        analyzerId: component.member.analyzerId,
        filePath: component.member.filePath,
        location: component.member.evidence,
      },
    })),
    graphPackage: feature.packageName,
    id: `feature:${feature.id}`,
    kind: 'virtual',
    label: feature.name,
  };
}

/** Represents only a published analyzer capability gap, never an inferred missing feature. */
function unavailableFeatureEvidenceNode(projectId: string): ProjectTreeNode {
  return {
    graphPackage: '',
    id: `feature-evidence:unavailable:${projectId}`,
    kind: 'virtual',
    label: 'Feature evidence unavailable',
    unavailable: true,
  };
}

/** Exhausts one opaque cursor sequence without reading the projection arrays directly. */
function listAllPages<T>(
  readPage: (cursor: string | undefined) => {
    readonly items: readonly T[];
    readonly nextCursor?: string;
  }
): readonly T[] {
  const result: T[] = [];
  let cursor: string | undefined;
  do {
    const page = readPage(cursor);
    result.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return result;
}

/** Keeps component and module rows deterministic without inspecting source paths. */
function compareComponent(left: FeatureComponent, right: FeatureComponent): number {
  return left.member.semanticPath.localeCompare(right.member.semanticPath);
}

/** Keeps features deterministic through their canonical opaque identities. */
function compareFeature(left: FeatureNavigation, right: FeatureNavigation): number {
  return left.id.localeCompare(right.id);
}

interface FeatureComponent {
  readonly label: string;
  readonly member: SourceFeatureMember;
}

interface FeatureNavigation {
  readonly id: string;
  readonly members: readonly FeatureComponent[];
  readonly name: string;
  readonly packageName: string;
}
