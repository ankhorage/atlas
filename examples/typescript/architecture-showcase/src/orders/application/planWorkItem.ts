import { planWorkItem, type WorkItem } from '../domain/workItem.js';
import type { ClockPort, WorkItemEventPublisher, WorkItemRepository } from './ports.js';

export type PlanWorkItem = (id: string) => WorkItem;

/*** Compose the application use case from its required outward capabilities. */
export function createPlanWorkItem(
  repository: WorkItemRepository,
  eventPublisher: WorkItemEventPublisher,
  clock: ClockPort
): PlanWorkItem {
  return id => {
    const workItem = repository.findById(id);
    if (workItem === undefined) throw new Error(`Unknown work item: ${id}`);
    const planned = planWorkItem(workItem, clock.now());
    repository.save(planned);
    eventPublisher.publish({ plannedAt: planned.plannedAt!, workItemId: planned.id });
    return planned;
  };
}
