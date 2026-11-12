import { describe, expect, it } from '@artiphishle/testosterone';
import type { ElementsDefinition } from 'cytoscape';

import { projectVisibleGraph } from '@/features/graph-view/utils/projectVisibleGraph';

describe('[scoped vendor compounds]', () => {
  it('groups canonical vendors without grouping unresolved scoped aliases', () => {
    const result = projectVisibleGraph({
      currentPackage: '',
      elements: createElements(),
      showCompoundNodes: true,
      showVendorPackages: true,
      subPackageDepth: 2,
    });
    const nodes = new Map(result.elements.nodes.map(node => [node.data.id, node]));

    expect(nodes.get('vendor-scope:@ankhorage')?.data.label).toBe('@ankhorage');
    expect(nodes.get('@ankhorage/zora')?.data.parent).toBe('vendor-scope:@ankhorage');
    expect(nodes.get('@ankhorage/zora')?.data.label).toBe('zora');
    expect(nodes.get('@ankhorage/devtools')?.data.parent).toBe('vendor-scope:@ankhorage');
    expect(nodes.get('@single/only')?.data.parent).toBeUndefined();
    expect(nodes.has('vendor-scope:@fixture-alias')).toBe(false);
    expect(nodes.get('@fixture-alias/list')?.data.parent).toBeUndefined();

    const zoraEdge = result.elements.edges.find(edge => edge.data.target === '@ankhorage/zora');
    expect(zoraEdge?.data.source).toBe('src.feature');
    expect(zoraEdge?.data.weight).toBe(2);
  });

  it('does not create scope compounds when compound nodes or vendors are hidden', () => {
    const base = {
      currentPackage: '',
      elements: createElements(),
      subPackageDepth: 2,
    };
    const flat = projectVisibleGraph({
      ...base,
      showCompoundNodes: false,
      showVendorPackages: true,
    });
    const intrinsicOnly = projectVisibleGraph({
      ...base,
      showCompoundNodes: true,
      showVendorPackages: false,
    });

    expect(hasNode(flat, 'vendor-scope:@ankhorage')).toBe(false);
    expect(hasNode(intrinsicOnly, 'vendor-scope:@ankhorage')).toBe(false);
    expect(hasNode(intrinsicOnly, '@ankhorage/zora')).toBe(false);
  });
});

function hasNode(elements: { readonly elements: ElementsDefinition }, id: string): boolean {
  return elements.elements.nodes.some(node => node.data.id === id);
}

function createElements(): ElementsDefinition {
  return {
    nodes: [
      { data: { id: 'src', classification: 'intrinsic', isIntrinsic: true } },
      {
        data: {
          id: 'src.feature',
          classification: 'intrinsic',
          isIntrinsic: true,
          parent: 'src',
        },
      },
      {
        data: {
          id: '@ankhorage/zora',
          classification: 'vendor',
          isIntrinsic: false,
        },
        classes: 'isVendor',
      },
      {
        data: {
          id: '@ankhorage/devtools',
          classification: 'vendor',
          isIntrinsic: false,
        },
        classes: 'isVendor',
      },
      {
        data: {
          id: '@ankhorage/supabase',
          classification: 'vendor',
          isIntrinsic: false,
        },
        classes: 'isVendor',
      },
      {
        data: {
          id: '@single/only',
          classification: 'vendor',
          isIntrinsic: false,
        },
        classes: 'isVendor',
      },
      {
        data: {
          id: '@fixture-alias/list',
          classification: 'unknown',
          isIntrinsic: false,
        },
        classes: 'isVendor',
      },
      {
        data: {
          id: '@fixture-alias/tree-view',
          classification: 'unknown',
          isIntrinsic: false,
        },
        classes: 'isVendor',
      },
    ],
    edges: [
      {
        data: {
          id: 'zora',
          source: 'src.feature',
          target: '@ankhorage/zora',
          weight: 2,
        },
      },
      {
        data: {
          id: 'devtools',
          source: 'src.feature',
          target: '@ankhorage/devtools',
          weight: 3,
        },
      },
      {
        data: {
          id: 'supabase',
          source: 'src.feature',
          target: '@ankhorage/supabase',
          weight: 4,
        },
      },
      {
        data: {
          id: 'unknown-alias',
          source: 'src.feature',
          target: '@fixture-alias/list',
          weight: 5,
        },
      },
    ],
  };
}
