package io.atlas.showcase.orders.adapter.out;

import io.atlas.showcase.orders.application.port.WorkItemRepository;
import io.atlas.showcase.orders.domain.WorkItem;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public final class InMemoryWorkItemRepository implements WorkItemRepository {
  private final Map<String, WorkItem> items = new HashMap<>();

  public Optional<WorkItem> findById(String id) { return Optional.ofNullable(items.get(id)); }
  public void save(WorkItem workItem) { items.put(workItem.id(), workItem); }
}
