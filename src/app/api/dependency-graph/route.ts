import { createNextJsApiRoute } from '@ankhorage/api-nextjs';
import { dependencyGraphApi } from '@ankhorage/dependency-graph/api';

/*** Bind the canonical dependency-graph action to the Next.js App Router transport. */
export const POST = createNextJsApiRoute(dependencyGraphApi, 'dependency-graph');
