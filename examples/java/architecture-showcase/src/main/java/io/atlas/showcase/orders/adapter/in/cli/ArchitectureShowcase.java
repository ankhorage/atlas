package io.atlas.showcase.orders.adapter.in.cli;

import io.atlas.showcase.orders.composition.OrderApplication;

/**
 * @usage
 * @readme
 * @title Architecture showcase
 */
public final class ArchitectureShowcase {
  public static void main(String[] args) { System.out.println(OrderApplication.create().execute("atlas-1")); }
}
