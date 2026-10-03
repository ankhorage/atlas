import type cytoscape from 'cytoscape';

type ElkLayoutOptions = cytoscape.BaseLayoutOptions &
  cytoscape.AnimatedLayoutOptions & {
    readonly name: 'elk';
    readonly animate: boolean;
    readonly animateFilter: (node: cytoscape.NodeSingular, i: number) => boolean;
    readonly animationDuration: number;
    readonly animationEasing: string | undefined;
    readonly fit: boolean;
    readonly nodeDimensionsIncludeLabels: boolean;
    readonly nodeLayoutOptions?: (node: cytoscape.NodeSingular) => Record<string, unknown> | void;
    readonly elk: Record<string, unknown>;
    readonly priority: (edge: cytoscape.EdgeSingular) => number | null;
    readonly padding?: number;
  };

/***
 * Reference: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
 */
export const layout: ElkLayoutOptions = {
  name: 'elk',

  /***
   * Reference: http://www.eclipse.org/elk/reference.html
   * Info: Drop prefix from options name, e.g. org.eclipse.elk.direction becomes elk.direction
   * Info: Enums use the name of the enum as string Direction.DOWN becomes elk.direction: 'DOWN'
   */
  elk: {
    algorithm: 'layered',
    'elk.direction': 'DOWN',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  },
  animate: true, // Whether to transition the node positions
  animateFilter: function (/* node, i */) {
    return true;
  }, // Whether to animate specific nodes when animation is on; non-animated nodes immediately go to their final positions
  animationDuration: 500, // Duration of animation in ms if enabled
  animationEasing: undefined, // Easing of animation if enabled

  fit: true, // Whether to fit
  nodeDimensionsIncludeLabels: false, // Boolean which changes whether label dimensions are included when calculating node dimensions
  nodeLayoutOptions: undefined, // Per-node options function
  // padding: 20, // Padding on fit
  transform: function (_node, pos) {
    return pos;
  }, // A function that applies a transform to the final node position
  ready: undefined, // Callback on layoutready
  stop: undefined, // Callback on layoutstop
  priority: function (/* edge */) {
    return null;
  }, // Edges with a non-nil value are skipped when geedy edge cycle breaking is enabled
};
