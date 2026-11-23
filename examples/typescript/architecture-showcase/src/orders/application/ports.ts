import type { WorkItem } from '../domain/workItem.js';

export interface ClockPort {
  now(): Date;
}

export interface WorkItemEventPublisher {
  publish(event: WorkItemPlanned): void;
}

export interface WorkItemRepository {
  findById(id: string): WorkItem | undefined;
  save(workItem: WorkItem): void;
}

export type WorkItemPlanned = Readonly<{ plannedAt: Date; workItemId: string }>;
