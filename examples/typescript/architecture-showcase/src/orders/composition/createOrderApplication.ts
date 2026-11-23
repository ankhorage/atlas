import { createPlanWorkItem, type PlanWorkItem } from '../application/planWorkItem.js';
import type { ClockPort } from '../application/ports.js';
import { createConsoleWorkItemEventPublisher } from '../adapters/out/consoleWorkItemEventPublisher.js';
import { createInMemoryWorkItemRepository } from '../adapters/out/inMemoryWorkItemRepository.js';

/*** Wire the domain, application, and concrete adapters at the outer composition boundary. */
export function createOrderApplication(clock: ClockPort = { now: () => new Date() }): PlanWorkItem {
  return createPlanWorkItem(
    createInMemoryWorkItemRepository([
      { id: 'atlas-1', state: 'draft', title: 'Explore dependency evidence' },
    ]),
    createConsoleWorkItemEventPublisher(),
    clock
  );
}
