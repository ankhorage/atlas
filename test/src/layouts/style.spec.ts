import { describe, expect, it } from '@artiphishle/testosterone';

import type { ZoraRuntimeTheme } from '@zora/ZoraProvider';
import cytoscape, { type ElementsDefinition } from 'cytoscape';

import { createGraphViewModel } from '@/features/graph-view/adapters/inbound/react/createGraphViewModel';
import { getStyle } from '@/features/graph-view/adapters/inbound/cytoscape/style';

describe('[getStyle]', () => {
  it('distinguishes declared workspace roots in both themes', () => {
    const elements = {
      nodes: [
        { data: { id: 'ordinary' } },
        { data: { id: 'workspace', isWorkspaceRoot: true }, classes: 'isWorkspaceRoot' },
      ],
      edges: [],
    };
    for (const theme of [createTheme('light'), createTheme('dark')]) {
      const cy = cytoscape({
        elements: toRenderableElements(elements),
        headless: true,
        styleEnabled: true,
        style: getStyle(elements, theme),
      });
      try {
        expect(cy.getElementById('workspace').style('background-color')).toBe(
          rgb(theme.semantics.accent.softBg)
        );
        expect(cy.getElementById('ordinary').style('background-color')).toBe(
          rgb(theme.semantics.brand.softBg)
        );
      } finally {
        cy.destroy();
      }
    }
  });

  it('marks cycle compounds without coloring their entire underlay in either theme', () => {
    const elements = {
      nodes: [
        { data: { id: 'p', auditCycleColor: '#dc2626' }, classes: 'auditCycle' },
        { data: { id: 'p.c', parent: 'p' } },
      ],
      edges: [],
    };
    for (const theme of [createTheme('light'), createTheme('dark')]) {
      const cy = cytoscape({
        elements: toRenderableElements(elements),
        headless: true,
        styleEnabled: true,
        style: getStyle(elements, theme),
      });
      try {
        const parent = cy.getElementById('p');
        for (const selected of [false, true]) {
          if (selected) parent.select();
          expect(parent.style('underlay-opacity')).toBe('0');
          expect(parent.style('border-color')).toBe('rgb(220,38,38)');
          expect(Number(parent.style('background-opacity')) < 0.18).toBe(true);
        }
      } finally {
        cy.destroy();
      }
    }
  });
  it('keeps nested compound fills visible and bounded while reserving real node padding', () => {
    const elements = {
      nodes: [
        { data: { id: 'p' } },
        { data: { id: 'p.c', parent: 'p' } },
        { data: { id: 'p.c.leaf', parent: 'p.c' } },
      ],
      edges: [],
    };
    const cy = cytoscape({
      elements: toRenderableElements(elements),
      headless: true,
      styleEnabled: true,
      style: getStyle(elements, createTheme('light')),
    });
    try {
      const outer = Number(cy.getElementById('p').style('background-opacity'));
      const inner = Number(cy.getElementById('p.c').style('background-opacity'));
      expect(outer > 0).toBe(true);
      expect(1 - (1 - outer) * (1 - inner) > outer).toBe(true);
      expect(1 - (1 - outer) * (1 - inner) < 0.18).toBe(true);
      expect(cy.getElementById('p.c.leaf').style('padding')).toBe('12px');
    } finally {
      cy.destroy();
    }
  });

  it('keeps selection and hover paint changes out of layout geometry', () => {
    const elements = { nodes: [{ data: { id: 'a', label: 'package.a' } }], edges: [] };
    const cy = cytoscape({
      elements: toRenderableElements(elements),
      headless: true,
      styleEnabled: true,
      style: getStyle(elements, createTheme('light')),
    });
    try {
      const node = cy.getElementById('a');
      const before = node.layoutDimensions({ nodeDimensionsIncludeLabels: true });
      node.addClass('highlight');
      expect(node.style('background-color')).toBe('rgb(45,85,125)');
      expect(node.layoutDimensions({ nodeDimensionsIncludeLabels: true })).toEqual(before);
      node.select();
      expect(node.style('outline-width')).toBe('2px');
      expect(node.layoutDimensions({ nodeDimensionsIncludeLabels: true })).toEqual(before);
      node.removeClass('highlight');
      node.unselect();
      node.addClass('hushed');
      expect(node.style('opacity')).toBe('0.2');
      expect(node.layoutDimensions({ nodeDimensionsIncludeLabels: true })).toEqual(before);
    } finally {
      cy.destroy();
    }
  });

  it('colors selected repositories without changing dimensions or overriding vendor, audit, and selection states', () => {
    const elements = {
      nodes: [
        { classes: 'repositoryColor0', data: { id: 'root', repositoryId: 'R_catalog' } },
        {
          classes: 'repositoryColor0',
          data: { id: 'child', parent: 'root', repositoryId: 'R_catalog' },
        },
        { classes: 'isVendor', data: { id: 'vendor', repositoryId: 'R_catalog' } },
        {
          classes: 'repositoryColor0 auditCycle',
          data: { id: 'audit', auditCycleColor: '#dc2626', repositoryId: 'R_catalog' },
        },
      ],
      edges: [],
    };
    const cy = cytoscape({
      elements: toRenderableElements(elements),
      headless: true,
      styleEnabled: true,
      style: getStyle(elements, createTheme('light')),
    });
    try {
      const root = cy.getElementById('root');
      const child = cy.getElementById('child');
      const before = child.layoutDimensions({ nodeDimensionsIncludeLabels: true });
      expect(root.style('background-color')).toBe('rgb(220,234,251)');
      expect(child.style('background-color')).toBe('rgb(220,234,251)');
      expect(cy.getElementById('vendor').style('background-color')).toBe('rgb(236,228,251)');
      expect(cy.getElementById('audit').style('border-color')).toBe('rgb(220,38,38)');
      root.select();
      expect(root.style('background-color')).toBe('rgb(45,85,125)');
      expect(child.layoutDimensions({ nodeDimensionsIncludeLabels: true })).toEqual(before);
    } finally {
      cy.destroy();
    }
  });

  it('keeps all seven repository roles distinct and readable in representative light and dark themes', () => {
    const elements = {
      nodes: Array.from({ length: 7 }, (_, index) => ({
        classes: `repositoryColor${index}`,
        data: { id: `repository-${index}` },
      })),
      edges: [],
    };
    for (const theme of [createTheme('light'), createTheme('dark')]) {
      const cy = cytoscape({
        elements: toRenderableElements(elements),
        headless: true,
        styleEnabled: true,
        style: getStyle(elements, theme),
      });
      try {
        const backgrounds = elements.nodes.map(node =>
          cy.getElementById(node.data.id).style('background-color')
        );
        expect(new Set(backgrounds).size).toBe(7);
        for (const node of elements.nodes) {
          const rendered = cy.getElementById(node.data.id);
          expect(
            contrastRatio(rendered.style('color'), rendered.style('background-color')) >= 4.5
          ).toBe(true);
          expect(rendered.style('border-color') !== rendered.style('background-color')).toBe(true);
        }
      } finally {
        cy.destroy();
      }
    }
  });

  it('keeps node dimensions stable across repeated style and highlight updates', () => {
    const elements = { nodes: [{ data: { id: 'a', name: 'a', label: 'package.a' } }], edges: [] };
    const cy = cytoscape({
      elements: toRenderableElements(elements),
      headless: true,
      styleEnabled: true,
      style: getStyle(elements, createTheme('light')),
    });
    try {
      const before = cy.getElementById('a').height();
      cy.style(getStyle(elements, createTheme('dark'))).update();
      cy.style(getStyle(elements, createTheme('light'))).update();
      expect(cy.getElementById('a').height()).toBe(before);
      expect(cy.getElementById('a').width()).toBe(24);
      expect(cy.getElementById('a').style('label')).toBe('package.a');
      cy.getElementById('a').data({ label: 'renamed' });
      expect(cy.getElementById('a').style('label')).toBe('renamed');
      expect(cy.getElementById('a').width()).toBe(24);
    } finally {
      cy.destroy();
    }
  });

  it('applies compound-safe endpoints while retaining bezier loop routing', () => {
    const elements = {
      nodes: [
        { data: { id: 'parent' } },
        { data: { id: 'child', parent: 'parent' } },
        { data: { id: 'peer' } },
      ],
      edges: [
        { data: { id: 'child-to-parent', source: 'child', target: 'parent', weight: 1 } },
        { data: { id: 'parent-to-child', source: 'parent', target: 'child', weight: 1 } },
        { data: { id: 'ordinary', source: 'child', target: 'peer', weight: 1 } },
        { data: { id: 'self-loop', source: 'child', target: 'child', weight: 1 } },
      ],
    };
    const cy = cytoscape({
      elements: toRenderableElements(elements),
      headless: true,
      style: getStyle(elements, createTheme('light')),
      styleEnabled: true,
    });

    try {
      for (const edgeId of ['child-to-parent', 'parent-to-child', 'ordinary']) {
        const edge = cy.getElementById(edgeId);
        expect(edge.style('source-endpoint')).toBe('outside-to-line');
        expect(edge.style('target-endpoint')).toBe('outside-to-line');
        expect(edge.style('curve-style')).toBe('bezier');
      }

      expect(cy.getElementById('self-loop').style('curve-style')).toBe('bezier');
    } finally {
      cy.destroy();
    }
  });

  it('renders active cycle edges above ordinary compound graph content', () => {
    const elements = {
      nodes: [{ data: { id: 'a' } }, { data: { id: 'b' } }],
      edges: [
        {
          classes: 'auditCycle',
          data: {
            id: 'cycle',
            source: 'a',
            target: 'b',
            weight: 1,
            auditCycleColor: '#dc2626',
            auditCycleStep: '1',
          },
        },
      ],
    };
    const cy = cytoscape({
      elements: toRenderableElements(elements),
      headless: true,
      style: getStyle(elements, createTheme('light')),
      styleEnabled: true,
    });

    try {
      const edge = cy.getElementById('cycle');
      expect(edge.style('z-compound-depth')).toBe('top');
      expect(edge.style('z-index-compare')).toBe('manual');
      expect(edge.style('z-index')).toBe('9999');
    } finally {
      cy.destroy();
    }
  });
});

/*** Creates a complete portable ZORA runtime theme for graph presentation tests. */
function createTheme(mode: 'dark' | 'light'): ZoraRuntimeTheme {
  const surface = mode === 'dark' ? '#101820' : '#f7f9fc';
  const content = mode === 'dark' ? '#edf4fb' : '#15202b';
  const [brand, secondary, accent, highlight, success, warning, info] = repositoryRoles(mode);
  const role = brand;

  return {
    colors: { primary: role.base },
    spacing: { s: 8, m: 16 },
    radii: { s: 6, m: 10 },
    semantics: {
      brand: role,
      secondary,
      accent,
      highlight,
      danger: role,
      success,
      warning,
      error: role,
      info,
      surface: {
        default: surface,
        subtle: mode === 'dark' ? '#18232d' : '#eef3f8',
        raised: surface,
        sunken: surface,
        overlay: surface,
        disabled: surface,
        inverse: content,
      },
      content: {
        default: content,
        muted: mode === 'dark' ? '#9bacbd' : '#586879',
        subtle: mode === 'dark' ? '#788999' : '#768493',
        disabled: '#88939e',
        icon: content,
        link: role.base,
        visited: role.strong,
        inverse: surface,
      },
      border: {
        default: '#708399',
        subtle: '#a9b5c2',
        strong: '#3c5268',
        divider: '#a9b5c2',
        focus: role.base,
      },
      selection: {
        background: '#2d557d',
        content: '#ffffff',
        border: '#537fad',
      },
    },
  };
}

/*** Models representative, independently distinguishable ZORA semantic roles for presentation tests. */
function repositoryRoles(mode: 'dark' | 'light') {
  const colors =
    mode === 'light'
      ? [
          ['#dceafb', '#537fad', '#173f68'],
          ['#ece4fb', '#8069aa', '#402b68'],
          ['#fdecc8', '#9a6b17', '#4c3200'],
          ['#f9e0ec', '#aa557f', '#65183d'],
          ['#d7f0df', '#47845b', '#153f24'],
          ['#fce5c4', '#a8691d', '#542b00'],
          ['#d9eff5', '#35778d', '#083d4d'],
        ]
      : [
          ['#173f68', '#78a8d8', '#edf4fb'],
          ['#402b68', '#b199df', '#f3ecff'],
          ['#4c3200', '#d9ab55', '#fff1d6'],
          ['#65183d', '#df8caf', '#ffeaf3'],
          ['#153f24', '#7cc691', '#e7ffed'],
          ['#542b00', '#e6a757', '#fff0dd'],
          ['#083d4d', '#70bed3', '#e3faff'],
        ];
  return colors.map(([softBg, outline, onSoftText]) => ({
    base: outline,
    hover: outline,
    strong: outline,
    softBg,
    softHover: softBg,
    softActive: softBg,
    outline,
    onSurfaceText: onSoftText,
    onSolidText: '#ffffff',
    onHoverText: '#ffffff',
    onStrongText: '#ffffff',
    onSoftText,
    onSoftHoverText: onSoftText,
    onSoftActiveText: onSoftText,
    disabledBg: '#d4d9df',
    onDisabledText: '#727b84',
  }));
}

/*** Calculates WCAG relative contrast from Cytoscape's normalized RGB output. */
function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/\d+/gu)?.map(Number);
    if (channels === undefined || channels.length < 3)
      throw new Error(`Expected RGB color, got ${color}.`);
    const [red, green, blue] = channels.map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/*** Converts the representative ZORA semantic hex values to Cytoscape's normalized RGB output. */
function rgb(hex: string): string {
  const channels = hex.match(/[a-f0-9]{2}/giu)?.map(value => Number.parseInt(value, 16));
  if (channels === undefined || channels.length !== 3)
    throw new Error(`Expected hex color, got ${hex}.`);
  return `rgb(${channels.join(',')})`;
}

function toRenderableElements(elements: ElementsDefinition): ElementsDefinition {
  const model = createGraphViewModel(elements, elements, []);
  return {
    nodes: model.nodes.map(node => ({
      classes: node.classes,
      data: { ...node.data, id: node.id, label: node.label, parent: node.parentId },
    })),
    edges: model.edges.map(edge => ({
      classes: edge.classes,
      data: { ...edge.data, id: edge.id, source: edge.source, target: edge.target },
    })),
  };
}
