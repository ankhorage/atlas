# AGENTS.md

<!--
This file is currently maintained manually from the Ankhorage devtools AGENTS.md template.
Repository automation may manage/sync it later.
-->

## Repository

Package: `atlas`

Atlas analyzes source projects, dependencies, architecture rules, and audit evidence and renders the
result as an interactive Cytoscape-based visualization.

Preserve working Atlas behavior after every change.

## Current architecture only

Only the current Atlas architecture is valid. Do not add or retain deprecated APIs,
compatibility aliases, shims, dual old/new paths, historical-state fallbacks, or migrations whose
sole purpose is supporting obsolete states.

When canonical graph or project-analysis behavior is owned by a released Ankhorage package, consume
that published public API instead of copying the implementation into Atlas.

Relevant canonical boundaries include:

- `@ankhorage/project-detector` for project/language/workspace detection
- `@ankhorage/graph` for generic graph data and algorithms
- `@ankhorage/graph-cytoscape` for generic Graph → Cytoscape conversion
- `@ankhorage/dependency-graph` for reusable dependency/import analysis

Cross-package usage must go through published public APIs and declared dependencies, never sibling
repository source files.

## Stability and recovery

Atlas must remain buildable, testable, and usable after every pull request.

The pre-modularization recovery point is:

- tag: `pkgviz-baseline-pre-graph-modularization`
- commit: `3f5cae03da7f05eaaa2b13ea9c78b3a429df6684`

Do not move or reuse that baseline tag.

For graph/dependency modularization, follow issue #142:

- no big-bang rewrite
- protect current behavior with regression tests before replacement
- migrate one responsibility at a time
- migrate language analyzers independently
- do not mix UI redesigns into extraction work
- do not remove an existing path until its replacement is proven equivalent in Atlas

## Required repository instructions

Before changing any file, read this `AGENTS.md` completely and inspect `.agents/skills/`.

Atlas explicitly adopts the repository-local Ankhorage engineering standards below. Their
requirements are mandatory for Atlas even where the skill text describes Ankhorage repositories.

For every implementation, refactoring, testing, review, or pull-request delivery task, load:

1. `.agents/skills/ankhorage-coding-rules/SKILL.md`
2. `.agents/skills/ankhorage-project-structure/SKILL.md` when source ownership, package boundaries,
   type/utility placement, public entrypoints, CLI structure, or source architecture are involved
3. `.agents/skills/hexagonal-architecture/SKILL.md` whenever the project-structure skill requires
   it or when feature/application boundaries are changed

These are target-architecture obligations, not permission for a big-bang rewrite. Existing Atlas
areas migrate through focused, regression-protected changes, while new and materially changed
architecture must follow the current rules.

When automation later manages these files, continue using the repository-local versions.

## Testing and regression coverage

Prefer behavioral regression tests over implementation-detail tests.

For graph/dependency changes, protect at least the affected semantics before replacement, including
where relevant:

- project/language selection
- intrinsic/vendor classification
- graph node/edge construction
- edge weights
- cycle membership and evidence
- vendor filtering
- depth projection and lifted-edge aggregation
- representative language fixtures

Do not weaken or remove regression coverage merely to make a migration pass.

## Audit and CI rules

Audit rules must be reusable outside the UI.

Build-tool integrations such as Maven plugins or future TypeScript/Node CI commands should call the
shared Atlas audit/rule contract rather than duplicate analyzers or rule logic.

Blocking audit rules must produce a non-zero process/build result. The first mandatory blocking
rule is `cyclic-dependencies`.

## Pull requests

Before creating or merging a pull request, run all applicable repository validation commands and
resolve every failure:

```sh
bun run lint
bun run format:check
bun run test
bun run build
```

The protected `CI / validate` check is authoritative for pull requests to `main`.

Keep pull requests narrow and independently revertible. For migration work, prefer tests-only
baseline PRs before implementation PRs.

## Dependencies

Use Bun for dependency installation and local package execution unless the task explicitly concerns
another ecosystem adapter.

Do not introduce a new dependency when an existing project dependency or a canonical Ankhorage
package already owns the required responsibility.

## Generated and temporary files

Do not commit generated build output, temporary analysis directories, extracted archives, or local
cache files unless they are intentional repository fixtures.

Archive/JAR handling must use isolated temporary directories, protect against path traversal, and
clean up after analysis.
