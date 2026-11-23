package io.atlas.showcase.orders.application;

import io.atlas.showcase.orders.application.port.WorkItemRepository;
import io.atlas.showcase.orders.domain.WorkItem;

public final class PlanWorkItem {
  private final WorkItemRepository repository;

  public PlanWorkItem(WorkItemRepository repository) { this.repository = repository; }

  public WorkItem execute(String id) {
    WorkItem planned = repository.findById(id).orElseThrow().plan();
    repository.save(planned);
    return planned;
  }
}
