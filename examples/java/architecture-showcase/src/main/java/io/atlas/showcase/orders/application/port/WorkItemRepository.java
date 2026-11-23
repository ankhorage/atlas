package io.atlas.showcase.orders.application.port;

import io.atlas.showcase.orders.domain.WorkItem;
import java.util.Optional;

public interface WorkItemRepository {
  Optional<WorkItem> findById(String id);
  void save(WorkItem workItem);
}
