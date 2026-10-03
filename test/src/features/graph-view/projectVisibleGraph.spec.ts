import { describe, expect, it } from '@artiphishle/testosterone';
import type { ElementsDefinition } from 'cytoscape';

import { projectVisibleGraph } from '@/features/graph-view/utils/projectVisibleGraph';

describe('[graph view projection]', () => {
  it('bounds depth relative to the active package and only the enabled node categories', () => {
    const elements: ElementsDefinition = {
      nodes: [
        ...['io', 'io.app', 'io.app.a', 'io.app.a.child', 'io.app.b'].map(id => ({
          data: { id, isIntrinsic: true },
        })),
        ...['vendor', 'vendor.one', 'vendor.one.two', 'vendor.one.two.three'].map(id => ({
          data: { id, isIntrinsic: false },
          classes: 'isVendor',
        })),
      ],
      edges: ['vendor', 'vendor.one', 'vendor.one.two', 'vendor.one.two.three'].map(target => ({
        data: { source: 'io.app.a.child', target },
      })),
    };
    const input = {
      elements,
      currentPackage: 'io.app',
      showCompoundNodes: false,
      subPackageDepth: 8,
    };
    expect(projectVisibleGraph({ ...input, showVendorPackages: false }).maxSubPackageDepth).toBe(2);
    expect(projectVisibleGraph({ ...input, showVendorPackages: true }).maxSubPackageDepth).toBe(4);
    expect(
      projectVisibleGraph({ ...input, currentPackage: '', showVendorPackages: false })
        .maxSubPackageDepth
    ).toBe(4);
    const maximum = projectVisibleGraph({
      ...input,
      showVendorPackages: false,
      subPackageDepth: 2,
    });
    const excessive = projectVisibleGraph({ ...input, showVendorPackages: false });
    expect(maximum.elements).toEqual(excessive.elements);
  });

  it('calculates the highest relevant branch only from Home and preserves explicit scopes', () => {
    const elements = createDeepElements();

    const home = projectVisibleGraph({
      currentPackage: '',
      elements,
      showCompoundNodes: false,
      showVendorPackages: true,
      subPackageDepth: 1,
    });
    const src = projectVisibleGraph({
      currentPackage: 'src',
      elements,
      showCompoundNodes: false,
      showVendorPackages: true,
      subPackageDepth: 1,
    });
    const io = projectVisibleGraph({
      currentPackage: 'src.io',
      elements,
      showCompoundNodes: false,
      showVendorPackages: true,
      subPackageDepth: 1,
    });

    expect(home.redirectPackage).toBe('src.io.reflectoring');
    expect(src.redirectPackage).toBeNull();
    expect(io.redirectPackage).toBeNull();
  });

  it('does not skip an explicit cycle scope even when it has only one direct package', () => {
    const result = projectVisibleGraph({
      currentPackage: 'src.io',
      elements: createDeepElements(),
      preservePackageScope: true,
      showCompoundNodes: false,
      showVendorPackages: true,
      subPackageDepth: 1,
    });

    expect(result.redirectPackage).toBeNull();
    expect(result.elements.nodes.map(node => node.data.id)).toEqual(['src.io.reflectoring']);
  });

  it('keeps the source graph immutable while projecting compound visibility', () => {
    const elements = createElements();

    const result = projectVisibleGraph({
      currentPackage: '',
      elements,
      showCompoundNodes: false,
      showVendorPackages: true,
      subPackageDepth: 2,
    });

    expect(elements.nodes[1]?.data.parent).toBe('src');
    expect(elements.nodes[1]?.data.parentInactive).toBeUndefined();
    const child = result.elements.nodes.find(node => node.data.id === 'src.feature');
    expect(child?.data.parent).toBeUndefined();
    expect(child?.data.parentInactive).toBe('src');
    expect(result.elements.nodes.some(node => node.data.id === 'src')).toBe(false);
  });

  it('uses immediate labels for descendants of visible compound nodes', () => {
    const result = projectVisibleGraph({
      currentPackage: 'coderadar.core',
      elements: {
        nodes: [
          { data: { id: 'coderadar.core.projectadministration', parent: 'coderadar.core' } },
          {
            data: {
              id: 'coderadar.core.projectadministration.services',
              parent: 'coderadar.core.projectadministration',
            },
          },
          {
            data: {
              id: 'coderadar.core.projectadministration.services.filepattern',
              parent: 'coderadar.core.projectadministration.services',
            },
          },
          {
            data: {
              id: 'coderadar.core.projectadministration.services.branch',
              parent: 'coderadar.core.projectadministration.services',
            },
          },
        ],
        edges: [],
      },
      showCompoundNodes: true,
      showVendorPackages: true,
      subPackageDepth: 3,
    });

    expect(result.elements.nodes.map(node => node.data.label)).toEqual([
      'projectadministration',
      'services',
      'filepattern',
      'branch',
    ]);
  });

  it('retains package-relative labels when compound nodes are hidden', () => {
    const result = projectVisibleGraph({
      currentPackage: 'coderadar.core',
      elements: {
        nodes: [
          { data: { id: 'coderadar.core.services' } },
          { data: { id: 'coderadar.core.services.filepattern' } },
        ],
        edges: [],
      },
      showCompoundNodes: false,
      showVendorPackages: true,
      subPackageDepth: 2,
    });

    expect(result.elements.nodes.map(node => node.data.label)).toEqual(['services.filepattern']);
  });
});

describe('[package scope with external dependencies]', () => {
  const elements: ElementsDefinition = {
    nodes: [
      'io',
      'io.reflectoring',
      'io.reflectoring.a',
      'io.reflectoring.b',
      'io.reflectoring.isolated',
    ].map(id => ({ data: { id, isIntrinsic: true } })),
    edges: [
      { data: { id: 'ab', source: 'io.reflectoring.a', target: 'io.reflectoring.b', weight: 2 } },
      { data: { id: 'external', source: 'io.reflectoring.a', target: 'lombok', weight: 3 } },
    ],
  };
  const graph = {
    ...elements,
    nodes: [...elements.nodes, { data: { id: 'lombok', isIntrinsic: false }, classes: 'isVendor' }],
  };
  const input = {
    elements: graph,
    currentPackage: '',
    showCompoundNodes: false,
    subPackageDepth: 2,
  };

  it('chooses the same relevant package scope with or without vendors', () => {
    expect(projectVisibleGraph({ ...input, showVendorPackages: true }).redirectPackage).toBe(
      'io.reflectoring'
    );
    expect(projectVisibleGraph({ ...input, showVendorPackages: false }).redirectPackage).toBe(
      'io.reflectoring'
    );
  });

  it('keeps adjacent vendors, edge weights and real isolated packages after navigating', () => {
    const result = projectVisibleGraph({
      ...input,
      currentPackage: 'io.reflectoring',
      showVendorPackages: true,
    });
    expect(result.redirectPackage).toBeNull();
    expect(result.elements.nodes.map(node => node.data.id)).toEqual([
      'io.reflectoring.a',
      'io.reflectoring.b',
      'io.reflectoring.isolated',
      'lombok',
    ]);
    expect(result.elements.edges.map(edge => edge.data.weight)).toEqual([2, 3]);
  });

  it('does not skip a package that itself participates in dependencies', () => {
    const related = {
      ...graph,
      edges: [...graph.edges, { data: { source: 'io', target: 'lombok' } }],
    };
    expect(
      projectVisibleGraph({ ...input, elements: related, showVendorPackages: true }).redirectPackage
    ).toBeNull();
  });
});

/*** Creates a minimal package hierarchy with compound metadata for projection tests. */
function createElements(): ElementsDefinition {
  return {
    nodes: [{ data: { id: 'src' } }, { data: { id: 'src.feature', parent: 'src' } }],
    edges: [],
  };
}

/*** Creates the exact empty-package chain that should drill from src to src.io.reflectoring. */
function createDeepElements(): ElementsDefinition {
  return {
    nodes: [
      { data: { id: 'src' } },
      { data: { id: 'src.io' } },
      { data: { id: 'src.io.reflectoring' } },
      { data: { id: 'src.io.reflectoring.alpha' } },
      { data: { id: 'src.io.reflectoring.beta' } },
    ],
    edges: [],
  };
}
