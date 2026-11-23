import type { SourceGraph } from '@ankhorage/dependency-graph';
import { describe, expect, it } from '@artiphishle/testosterone';

import { addSourceFeatureNavigation } from '@/features/project-tree/application/use-cases/addSourceFeatureNavigation';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import { resolveProjectTreeGraphNodeId } from '@/features/project-tree/utils/resolveProjectTreeGraphNodeId';
import type { ProjectFileTree } from '@/types/projectFiles';

describe('[source feature navigation]', () => {
  it('places explicit feature members under their analyzer-established package with source evidence', () => {
    const tree = addSourceFeatureNavigation(buildProjectTree(files()), sourceGraph());
    const packageNode = tree[0]?.children?.[0];
    const feature = packageNode?.children?.at(-1);
    const component = feature?.children?.[0];
    if (feature === undefined) throw new Error('Expected an evidenced feature row.');

    expect(feature).toEqual({
      children: [
        {
          graphPackage: 'app.catalog',
          id: 'feature-member:feature:current:catalog:current:declaration:CatalogCard',
          kind: 'virtual',
          label: 'CatalogCard',
          sourceEvidence: {
            analyzerId: 'typescript',
            filePath: 'src/catalog/CatalogCard.tsx',
            location: { line: 4, column: 1, endLine: 12, endColumn: 2 },
          },
        },
      ],
      graphPackage: 'app.catalog',
      id: 'feature:feature:current:catalog',
      kind: 'virtual',
      label: 'catalog',
    });
    expect(component).toEqual({
      graphPackage: 'app.catalog',
      id: 'feature-member:feature:current:catalog:current:declaration:CatalogCard',
      kind: 'virtual',
      label: 'CatalogCard',
      sourceEvidence: {
        analyzerId: 'typescript',
        filePath: 'src/catalog/CatalogCard.tsx',
        location: { line: 4, column: 1, endLine: 12, endColumn: 2 },
      },
    });
    expect(resolveProjectTreeGraphNodeId(feature, ['app.catalog'])).toBe('app.catalog');
  });

  it('does not infer a feature package from a member file path', () => {
    const graph = sourceGraph({ packageName: undefined });
    const tree = addSourceFeatureNavigation(buildProjectTree(files()), graph);

    expect(tree[0]?.children?.[0]?.children?.map(node => node.label)).toEqual(['CatalogCard.tsx']);
  });

  it('adds analyzer-proven features to a leaf package row without existing children', () => {
    const tree = addSourceFeatureNavigation(
      [
        {
          graphPackage: 'app.catalog',
          id: 'directory:catalog',
          kind: 'directory',
          label: 'catalog',
        },
      ],
      sourceGraph()
    );

    expect(tree).toEqual([
      {
        children: [
          {
            children: [
              {
                graphPackage: 'app.catalog',
                id: 'feature-member:feature:current:catalog:current:declaration:CatalogCard',
                kind: 'virtual',
                label: 'CatalogCard',
                sourceEvidence: {
                  analyzerId: 'typescript',
                  filePath: 'src/catalog/CatalogCard.tsx',
                  location: { line: 4, column: 1, endLine: 12, endColumn: 2 },
                },
              },
            ],
            graphPackage: 'app.catalog',
            id: 'feature:feature:current:catalog',
            kind: 'virtual',
            label: 'catalog',
          },
        ],
        graphPackage: 'app.catalog',
        id: 'directory:catalog',
        kind: 'directory',
        label: 'catalog',
      },
    ]);
  });

  it('represents unsupported feature evidence as unavailable', () => {
    const graph = sourceGraph({ capabilities: [] });
    const tree = addSourceFeatureNavigation(buildProjectTree(files()), graph);

    expect(tree.at(-1)).toEqual({
      graphPackage: '',
      id: 'feature-evidence:unavailable:current',
      kind: 'virtual',
      label: 'Feature evidence unavailable',
      unavailable: true,
    });
  });
});

/** Builds a package tree whose package identity is independent from its filesystem directory names. */
function files(): ProjectFileTree {
  return {
    src: {
      catalog: {
        'CatalogCard.tsx': {
          className: 'CatalogCard',
          imports: [],
          package: 'app.catalog',
          path: 'src/catalog/CatalogCard.tsx',
        },
      },
    },
  };
}

/** Builds canonical declaration evidence equivalent to one TypeScript @feature declaration. */
function sourceGraph(overrides: SourceGraphOverrides = {}): SourceGraph {
  const packageName = 'packageName' in overrides ? overrides.packageName : 'app.catalog';
  return {
    version: 1,
    capabilities: [
      {
        analyzerId: 'typescript',
        available: overrides.capabilities ?? ['declarations', 'documentation', 'source-locations'],
        projectId: 'current',
      },
    ],
    graph: {
      edges: [],
      nodes: [
        {
          id: 0,
          data: {
            analyzerId: 'typescript',
            filePath: 'src/catalog/CatalogCard.tsx',
            kind: 'file',
            name: 'CatalogCard.tsx',
            path: 'src/catalog/CatalogCard.tsx',
            projectId: 'current',
            semanticPath: 'current:file:src/catalog/CatalogCard.tsx',
          },
        },
        {
          id: 1,
          data: {
            analyzerId: 'typescript',
            documentation: { tags: { feature: ['catalog'] }, text: '' },
            filePath: 'src/catalog/CatalogCard.tsx',
            kind: 'function',
            location: { line: 4, column: 1, endLine: 12, endColumn: 2 },
            name: 'CatalogCard',
            packageName,
            projectId: 'current',
            semanticPath: 'current:declaration:CatalogCard',
          },
        },
      ],
    },
  };
}

interface SourceGraphOverrides {
  readonly capabilities?: SourceGraph['capabilities'][number]['available'];
  readonly packageName?: string | undefined;
}
