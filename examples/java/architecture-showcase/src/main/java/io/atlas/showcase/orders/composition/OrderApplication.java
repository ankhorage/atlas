package io.atlas.showcase.orders.composition;

import io.atlas.showcase.orders.adapter.out.InMemoryWorkItemRepository;
import io.atlas.showcase.orders.application.PlanWorkItem;
import io.atlas.showcase.orders.domain.WorkItem;
import io.atlas.showcase.orders.domain.WorkItemState;

public final class OrderApplication {
  public static PlanWorkItem create() {
    InMemoryWorkItemRepository repository = new InMemoryWorkItemRepository();
    repository.save(new WorkItem("atlas-1", "Explore dependency evidence", WorkItemState.DRAFT));
    return new PlanWorkItem(repository);
  }
}
