import type { DependencyGraph } from '@ankhorage/dependency-graph';
import { isRecord } from '@ankhorage/utility/object';

/*** Request one dependency graph through the canonical Atlas API action. */
export async function requestDependencyGraphAsync(
  endpoint: string,
  projectPath: string
): Promise<DependencyGraph> {
  const response = await fetch(endpoint, {
    body: JSON.stringify({ projects: [{ id: 'current', rootPath: projectPath }] }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body: unknown = await response.json();

  if (!response.ok) throw new Error(readApiError(body));
  if (!isDependencyGraph(body))
    throw new Error('The dependency-graph action returned an invalid graph.');
  return body;
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
