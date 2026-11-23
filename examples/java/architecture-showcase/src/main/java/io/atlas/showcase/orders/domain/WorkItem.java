package io.atlas.showcase.orders.domain;

public record WorkItem(String id, String title, WorkItemState state) {
  public WorkItem plan() {
    if (state != WorkItemState.DRAFT) throw new IllegalStateException("Only drafts can be planned.");
    return new WorkItem(id, title, WorkItemState.PLANNED);
  }
}
