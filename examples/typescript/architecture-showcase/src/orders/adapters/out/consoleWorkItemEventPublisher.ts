import type { WorkItemEventPublisher } from '../../application/ports.js';

/*** Translate application events to the example application's command-line boundary. */
export function createConsoleWorkItemEventPublisher(): WorkItemEventPublisher {
  return {
    publish: event =>
      console.log(`planned=${event.workItemId} at=${event.plannedAt.toISOString()}`),
  };
}
