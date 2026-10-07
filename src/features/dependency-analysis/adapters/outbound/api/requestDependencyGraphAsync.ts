import type { DependencyGraph } from '@ankhorage/dependency-graph';
import { dependencyGraphApi, type DependencyGraphApiInput } from '@ankhorage/dependency-graph/api';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { isRecord } from '@ankhorage/utility/object';

/*** Dispatch one dependency graph action through the trusted local API runtime. */
export async function requestDependencyGraphAsync(
  inspection: ProjectInspection
): Promise<DependencyGraph> {
  const input: DependencyGraphApiInput = { projects: [{ id: 'current', inspection }] };
  const binding = dependencyGraphApi.getBinding('dependency-graph');
  if (binding === undefined) throw new Error('The dependency-graph action is unavailable.');
  const response = await dependencyGraphApi.dispatchAsync({
    operationId: binding.operationId,
    method: binding.method,
    params: {},
    query: {},
    headers: {},
    body: input,
  });

  if (response.status >= 400) throw new Error(readApiError(response.body));
  if (!isDependencyGraph(response.body))
    throw new Error('The dependency-graph action returned an invalid graph.');
  return response.body;
}

/*** Read the explicit API error while retaining a stable fallback for malformed responses. */
function readApiError(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== 'string') {
    return 'Dependency analysis failed.';
  }
  return `Dependency analysis failed: ${body.error.code}`;
}

/*** Narrow the transport response to the graph shape consumed by Atlas projections. */
function isDependencyGraph(value: unknown): value is DependencyGraph {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges);
}
