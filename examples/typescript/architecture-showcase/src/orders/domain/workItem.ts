export type WorkItemState = 'draft' | 'planned';

export type WorkItem = Readonly<{
  id: string;
  plannedAt?: Date;
  state: WorkItemState;
  title: string;
}>;

/*** Apply the work-planning state transition without exposing infrastructure details to the domain. */
export function planWorkItem(workItem: WorkItem, plannedAt: Date): WorkItem {
  if (workItem.state !== 'draft') throw new Error('Only drafts can be planned.');
  return { ...workItem, plannedAt, state: 'planned' };
}
