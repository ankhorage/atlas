# Performance

Graph rendering follows the applicable [Cytoscape performance guidance](https://js.cytoscape.org/#performance).
PKGViz owns package projection and presentation; ZORA GraphView owns the renderer, layout lifecycle,
and viewport workflow. A topology change must produce a correctly framed graph through that workflow,
not additional component effects. Source changes are not evidence of browser responsiveness.

| Priority | Recommendation / responsibility                                           | Owner  | Status and evidence                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Avoid repeated full-graph searches                                        | PKGViz | Implemented: package-ancestor and cycle-overlay indexes replace per-element scans. CPU measurements below.                                                                                                                                                                                                                                                                                                                                      |
| P0       | Avoid unnecessary element replacement and layout work                     | ZORA   | Released in 20.3.8 and materialized in PKGViz: [PR #491](https://github.com/ankhorage/zora/pull/491) reconciles presentation updates in place. Owner regressions preserve selection, positions and viewport without relayout.                                                                                                                                                                                                                   |
| P0       | Settle obsolete layouts safely and release resources                      | ZORA   | Integrated from 20.3.8: asynchronous ELK completion is isolated and stale results are discarded. ELK computation itself remains uncancellable; browser workload acceptance is pending.                                                                                                                                                                                                                                                          |
| P1       | Batch graph mutations and use ID lookup                                   | ZORA   | Integrated: batched element reconciliation retains identity and uses direct ID lookup.                                                                                                                                                                                                                                                                                                                                                          |
| P1       | Keep hover/selection updates independent of layout                        | PKGViz | Restored leaf-neighborhood presentation through public GraphView events. Prepared model data is reused; selection outlines and hover paint preserve measured node dimensions in regression tests.                                                                                                                                                                                                                                               |
| P1       | Avoid repeated label measurement                                          | Shared | Labels use prepared data; ZORA 20.4.0 measures styled text during reconciliation and writes only changed sizes. No character-count width estimates or per-frame measurement callbacks. Browser acceptance pending.                                                                                                                                                                                                                              |
| P1       | Normalize zoom to the current view                                        | ZORA   | Integrated from 20.5.0: 100% is the current node fit capped at 24 CSS-pixel labels. The lower limit is 50%; the upper limit grows beyond 200% when needed to make leaf labels reach 24 CSS pixels. Navigation refreshes the slider bounds through the owner lifecycle.                                                                                                                                                                          |
| P1       | Fit for readability without zoom-driven relayout                          | ZORA   | Integrated from 20.5.0 ([PR #495](https://github.com/ankhorage/zora/pull/495)): explicit Fit compacts spacing with an eight-step collision-bounded search and persists the exact result. Ordinary zoom never reruns layout. Already-overlapping, locked-leaf or over-2,000-node views skip compaction; manual readable zoom remains available. Browser acceptance pending.                                                                      |
| P1       | Avoid layout animation overhead                                           | ZORA   | Current GraphView forces non-animated layouts; PKGViz layout-option values do not override that owner policy.                                                                                                                                                                                                                                                                                                                                   |
| P1       | Keep ordinary edges opaque and labels limited                             | PKGViz | Existing baseline: solid opaque edges; ordinary edges have no labels. Cycle-step labels and directed arrows retain their meaning.                                                                                                                                                                                                                                                                                                               |
| P1       | Bound displayed graph size                                                | PKGViz | Vendor-independent navigation skips empty structural chains while retaining real isolated packages and external dependencies. Lifted edge weights and original edge IDs remain covered by regression tests. The depth slider is now bounded by the active package scope and enabled node categories, not the whole project.                                                                                                                     |
| P1       | Bound compound paint intensity                                            | PKGViz | Prepared depth steps approach, but never exceed, an 18% cumulative tint. Numeric style rules grow with hierarchy depth, not node count; no per-frame ancestry callbacks. Browser appearance acceptance pending.                                                                                                                                                                                                                                 |
| P1       | Keep compound cycle highlights paint-only                                 | PKGViz | Cycle compounds use their border/title and an outline, without the group-wide red underlay. Normal bounded compound fills remain visible; light/dark style regressions pass.                                                                                                                                                                                                                                                                    |
| P1       | Resolve overlap warnings                                                  | Shared | Integrated from ZORA 20.4.1 ([PR #494](https://github.com/ankhorage/zora/pull/494)): the three reported Coderadar dependencies become self-loops after depth projection. The owner now sizes loop control points outside measured node bounds after size/style/layout changes, never on pan or zoom. Dependencies and weights are retained. Browser acceptance remains pending; this is not a blanket guarantee against other overlap warnings. |
| P2       | Reduce label detail, pixel density, edge routing cost or compound content | Shared | Proposal only: requires measured benefit and user agreement on visual tradeoffs. No quality-reducing defaults enabled.                                                                                                                                                                                                                                                                                                                          |
| P0       | Share graph/tree/audit project analysis                                   | PKGViz | Implemented: the request-time page load derives all three results from one snapshot. Concurrent reads for the same path share only in-flight work; settled successes and failures are discarded so later loads remain fresh and retryable. Client mounting no longer starts analysis server actions.                                                                                                                                            |

## Performance measurements

Measured improvements on the local synthetic benchmark below:

- **50% fewer complete project-analysis pipelines during initial loading:** graph/tree and audit
  previously performed two independent language detection, filesystem parsing, and graph-building
  pipelines. The shared snapshot reduces that deterministic work count from two to one. This is a
  workflow count, not a claim that wall-clock loading time is exactly halved.
- **About 77 times faster graph-model preparation:** 294.5 ms down to 3.8 ms without cycle
  overlays, removing about 291 ms of CPU work from each measured model update.
- **About 84 times faster with 50 cycle overlays:** 342.6 ms down to 4.1 ms, while preserving
  cycle-color precedence and directed-edge step numbering.

These gains reduce the work needed to prepare graph updates without removing graph details.
They describe model preparation only, not the speed of the entire application or browser renderer.

Run `bun test/benchmarks/graphPresentation.ts`. The synthetic fixture contains 5,251 package nodes,
15,000 directed edges, and an optional 50 cycle overlays. Each result is the median of nine samples
after three warmups, on the same machine/runtime (macOS arm64, Bun 1.4.2).

| Operation                | Before (`5496a87`) | Current presentation |
| ------------------------ | -----------------: | -------------------: |
| Model, no cycle overlays |           294.5 ms |               3.8 ms |
| Model, 50 cycle overlays |           342.6 ms |               4.1 ms |
| Package/depth projection |             6.4 ms |               8.1 ms |

Rechecked on 2026-09-20 with bounded compound shading and corrected package projection. Projection
now retains original edge evidence and removes empty structural containers: its additional work is
shown explicitly, not counted as a speed improvement.

These are local CPU microbenchmarks, not browser frame-rate, layout, memory, network, or end-to-end
measurements. Timings vary; there is no timing threshold in the regression suite. Update this table
when owner fixes are released/integrated or measurements change. Further optimization candidates
must be reported before implementation. E2E and smoke tests are currently excluded by agreement.

The materialization command uses a project-local Ankh provider cache under `.generated/ankh`.
This isolates the project from the global cache, but a local catalog can also retain an older release. The generated
`zora-artifact.json` records the actual published version used; generated artifacts and caches are
not committed. The CLI still follows its published provider catalog and cache refresh policy.
