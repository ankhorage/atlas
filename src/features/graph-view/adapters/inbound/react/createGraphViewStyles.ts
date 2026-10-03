import type { GraphViewStyleRule } from '@zora/graph-view';
import type { ZoraRuntimeTheme } from '@zora/ZoraProvider';
import type { ElementsDefinition, LayoutOptions, StylesheetJson } from 'cytoscape';

import { getStyle as getBreadthfirstStyle } from '@/features/graph-view/adapters/inbound/cytoscape/breadthfirst/style';
import { getStyle as getCircleStyle } from '@/features/graph-view/adapters/inbound/cytoscape/circle/style';
import { getStyle as getConcentricStyle } from '@/features/graph-view/adapters/inbound/cytoscape/concentric/style';
import { getStyle as getElkStyle } from '@/features/graph-view/adapters/inbound/cytoscape/elk/style';
import { getStyle as getGridStyle } from '@/features/graph-view/adapters/inbound/cytoscape/grid/style';
import { getStyle as getCommonStyle } from '@/features/graph-view/adapters/inbound/cytoscape/style';

/*** Builds ZORA GraphView style rules from the existing Atlas Cytoscape style policy. */
export function createGraphViewStyles(
  elements: ElementsDefinition,
  theme: ZoraRuntimeTheme,
  layout: LayoutOptions['name']
): readonly GraphViewStyleRule[] {
  return [...getCommonStyle(elements, theme), ...getLayoutStyle(layout)].map(toGraphViewStyleRule);
}

/*** Converts one Cytoscape stylesheet rule into the GraphView presentation contract. */
function toGraphViewStyleRule(rule: StylesheetJson[number]): GraphViewStyleRule {
  return {
    selector: rule.selector,
    style: { ...('style' in rule ? rule.style : rule.css) },
  };
}

/*** Resolves the visual style extension owned by the active layout. */
function getLayoutStyle(layout: LayoutOptions['name']): StylesheetJson {
  if (layout === 'breadthfirst') return getBreadthfirstStyle();
  if (layout === 'circle') return getCircleStyle();
  if (layout === 'elk') return getElkStyle();
  if (layout === 'grid') return getGridStyle();
  return getConcentricStyle();
}
