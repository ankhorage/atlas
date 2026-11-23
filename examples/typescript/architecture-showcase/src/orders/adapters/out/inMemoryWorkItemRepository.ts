import type { WorkItemRepository } from '../../application/ports.js';
import type { WorkItem } from '../../domain/workItem.js';

/*** Provide a replaceable in-memory adapter for the repository port. */
export function createInMemoryWorkItemRepository(initial: readonly WorkItem[]): WorkItemRepository {
  const items = new Map(initial.map(item => [item.id, item]));
  return {
    findById: id => items.get(id),
    save: workItem => items.set(workItem.id, workItem),
  };
}
