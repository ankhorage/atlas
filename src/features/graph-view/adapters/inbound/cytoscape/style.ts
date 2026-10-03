import type { ZoraRuntimeTheme } from '@zora/ZoraProvider';
import type { ElementsDefinition, StylesheetJson } from 'cytoscape';

import {
  getGraphPalette,
  type GraphPalette,
} from '@/features/graph-view/adapters/inbound/cytoscape/getGraphPalette';
import { getWeightBuckets } from '@/features/graph-view/adapters/inbound/cytoscape/getWeightBuckets';
import { createCompoundOpacityIndex } from '@/features/graph-view/utils/createCompoundOpacityIndex';

/*** Builds the shared Cytoscape styles for the active theme. */
export function getStyle(
  filteredElements: ElementsDefinition,
  theme: ZoraRuntimeTheme
): StylesheetJson {
  const colors = getGraphPalette(theme);
  const { thresholds } = getWeightBuckets(3, 'linear', filteredElements);

  return [
    ...getNodeBaseStyles(colors),
    ...getNodeInteractionStyles(colors),
    ...getNodeStateStyles(colors),
    ...getCompoundStyles(colors),
    ...getCompoundOpacityStyles(filteredElements),
    ...getEdgeBaseStyles(colors),
    ...getEdgeWeightStyles(colors, thresholds),
    ...getCycleEdgeStyles(colors),
  ];
}

/***
 * Shows leaf neighborhoods without changing layout geometry or dimming compound descendants.
 * @performance Use paint-only interaction styles; border size, labels and dimensions stay stable.
 */
function getNodeInteractionStyles(colors: GraphPalette): StylesheetJson {
  return [
    { selector: 'node:childless.hushed', style: { opacity: 0.2 } },
    {
      selector: 'node.highlight-outgoer, node.highlight-incomer',
      style: { 'border-color': colors.selectedRing, opacity: 1 },
    },
    {
      selector: 'node:childless.highlight',
      style: { 'background-color': colors.selectedFill, color: colors.selectedText, opacity: 1 },
    },
  ];
}

/***
 * Maps prepared node presentation data without per-element style callbacks.
 * @performance
 * Preserve data(label): createGraphViewModel prepares labels outside Cytoscape style recalculation.
 * ZORA owns measured label width. Keep height independent of the previous rendered height, otherwise repeated
 * style updates can change geometry and trigger further layout work. The style regression tests
 * cover stable dimensions across theme changes and updates to prepared label data.
 */
function getNodeBaseStyles(colors: GraphPalette): StylesheetJson {
  return [
    {
      selector: 'node',
      style: {
        shape: 'bottom-round-rectangle',
        'background-color': colors.nodeBg,
        'border-color': colors.nodeBorder,
        color: colors.nodeText,
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        width: 24,
        height: 24,
        padding: '12px',
        'border-width': 1,
        'font-size': '14px',
        'overlay-opacity': 0, // avoid gray overlay
      },
    },
    {
      selector: 'node.isVendor',
      style: {
        'background-color': colors.nodeBgVendor,
        'border-color': colors.nodeBorderVendor,
        color: colors.nodeTextVendor,
      },
    },
  ];
}

/***
 * Preserves selected-node and audit-cycle presentation.
 * @performance Selection uses an outline: changing border width changes layout dimensions.
 * Audit overlays retain their existing geometry and remain separate from transient interactions.
 */
function getNodeStateStyles(colors: GraphPalette): StylesheetJson {
  return [
    {
      selector: 'node.auditCycle',
      style: {
        'border-color': 'data(auditCycleColor)',
        'border-width': 5,
        opacity: 1,
        'underlay-color': 'data(auditCycleColor)',
        'underlay-opacity': 0.18,
        'underlay-padding': 4,
        'z-index': 999,
      },
    },
    { selector: 'node.isParent', style: { 'font-weight': 'bold' } },
    {
      selector: 'node:selected',
      style: {
        'background-color': colors.selectedFill,
        'border-color': colors.selectedRing,
        'outline-color': colors.selectedRing,
        'outline-width': 2,
        color: colors.selectedText,
        'background-opacity': 1,
        opacity: 1,
        'overlay-opacity': 0,
      },
    },
  ];
}

/***
 * Shows softly tinted compound boundaries with bounded, prepared nested-depth opacity.
 * @performance Keep grouping paint-only; do not add nested DOM surfaces or extra graph elements.
 */
function getCompoundStyles(colors: GraphPalette): StylesheetJson {
  return [
    {
      selector: 'node:parent, node:parent:selected',
      style: {
        'background-opacity': 0.04,
        'background-color': colors.compoundBg,
        color: colors.nodeText,
        'border-width': 1,
        'border-opacity': 0.35,
        'border-color': colors.nodeBorder,
        'text-valign': 'top',
        'text-margin-y': -5,
        padding: '16px',
        'text-background-color': colors.canvasBg,
        'text-background-opacity': 0.85,
        'text-background-padding': '3px',
        'text-halign': 'center',
        'font-size': 14,
        'font-weight': 'bold',
        'font-style': 'italic',
        label: 'data(label)',
      },
    },
    {
      selector: 'node:parent.isVendor, node:parent.isVendor:selected',
      style: {
        'background-color': colors.nodeBgVendor,
        'border-color': colors.nodeBorderVendor,
        color: colors.nodeTextVendor,
      },
    },
    {
      selector: 'node:parent.auditCycle, node:parent.auditCycle:selected',
      style: {
        'underlay-opacity': 0,
        'border-color': 'data(auditCycleColor)',
        'border-opacity': 0.8,
        'outline-color': 'data(auditCycleColor)',
        'outline-width': 2,
        color: 'data(auditCycleColor)',
      },
    },
  ];
}

/***
 * Emits one numeric paint rule per visible depth, including depths created by detached endpoints.
 * @performance Bound stylesheet size by hierarchy depth, not node count; no style callbacks.
 */
function getCompoundOpacityStyles(elements: ElementsDefinition): StylesheetJson {
  const ids = new Set(elements.nodes.map(node => node.data.id));
  const parents = new Map(
    elements.nodes.flatMap(node => {
      const { id, parent } = node.data;
      return typeof id === 'string' && typeof parent === 'string' && ids.has(parent)
        ? [[id, parent] as const]
        : [];
    })
  );
  const opacities = createCompoundOpacityIndex(parents, new Set());
  return [...new Set(opacities.values())].map(opacity => ({
    selector: `node:parent[compoundFillOpacity = ${opacity}]`,
    style: { 'background-opacity': opacity },
  }));
}

/***
 * Keeps ordinary directed edges opaque to avoid the extra rendering cost of translucent arrows.
 * @performance
 * Hushed edges are an intentional interaction state, not the base rendering policy. Retain arrows
 * and loop-capable routing: cheaper edge styles must not silently remove dependency direction or
 * lifted self-loops. Measure and discuss those visual tradeoffs before changing this baseline.
 */
function getEdgeBaseStyles(colors: GraphPalette): StylesheetJson {
  return [
    {
      selector: 'edge',
      style: {
        'arrow-scale': 1,
        'target-arrow-color': colors.edge,
        'target-arrow-shape': 'chevron',
        'target-arrow-fill': 'filled',
        'line-color': colors.edge,
        // Bezier routing keeps lifted self-loops renderable; line endpoints avoid invalid compound overlaps.
        'curve-style': 'bezier',
        'source-endpoint': 'outside-to-line',
        'target-endpoint': 'outside-to-line',
        opacity: 1,
        'line-opacity': 1,
      },
    },
    {
      selector: 'edge.hushed',
      style: {
        opacity: 0.04,
      },
    },
    {
      selector: 'edge.highlight-outgoer, edge.highlight-incomer, edge.highlight-dependency',
      style: {
        opacity: 1,
        'line-opacity': 1,
        width: 4,
        'line-color': colors.weightXl,
        'target-arrow-color': colors.weightXl,
        'source-arrow-color': colors.weightXl,
      },
    },
  ];
}

/*** Applies the existing aggregate dependency-weight buckets. */
function getEdgeWeightStyles(colors: GraphPalette, thresholds: readonly number[]): StylesheetJson {
  return [
    { selector: 'edge[weight <= 1]', style: { label: '' } },
    {
      selector: `edge[weight > 1][weight <= ${thresholds[0]}]`,
      style: {
        width: 1,
        'line-color': colors.weightXs,
        'target-arrow-color': colors.weightXs,
      },
    },
    {
      selector: `edge[weight > ${thresholds[0]}][weight <= ${thresholds[1]}]`,
      style: {
        width: 4,
        'arrow-scale': 2,
        'line-color': colors.weightMd,
        'target-arrow-color': colors.weightMd,
      },
    },
    {
      selector: `edge[weight > ${thresholds[1]}]`,
      style: {
        width: 8,
        'line-color': colors.weightXl,
        'target-arrow-color': colors.weightXl,
      },
    },
  ];
}

/*** Shows audit steps above compound content only for active cycle edges. */
function getCycleEdgeStyles(colors: GraphPalette): StylesheetJson {
  return [
    {
      selector: 'edge.auditCycle',
      style: {
        width: 6,
        opacity: 1,
        'line-opacity': 1,
        'arrow-scale': 1.5,
        'line-color': 'data(auditCycleColor)',
        'target-arrow-color': 'data(auditCycleColor)',
        color: 'data(auditCycleColor)',
        label: 'data(auditCycleStep)',
        'font-size': 12,
        'font-weight': 'bold',
        'text-background-color': colors.canvasBg,
        'text-background-opacity': 0.9,
        'text-background-padding': '3px',
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 9999,
      },
    },
  ];
}
