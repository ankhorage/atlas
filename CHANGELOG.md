# Changelog

## 0.22.0

### Minor Changes

- 4d0a428: Add evidence-backed feature and component navigation to the Atlas workspace tree.

## 0.21.7

### Patch Changes

- c70b75b: Publish Node-compatible JavaScript and TypeScript declarations for Atlas capabilities, CLI provider, and binary entrypoints.

## 0.21.6

### Patch Changes

- 044162f: Render the workspace graph loading indicator centered from the server-rendered first frame.

## 0.21.5

### Patch Changes

- 46e09a6: Let repository colors be selected from the published ZORA picker while validating their persisted overrides.

## 0.21.4

### Patch Changes

- 6663c6e: Fix multi-repository graph and tree identities so source modules follow real filesystem compounds.

## 0.21.3

### Patch Changes

- c0c4cb2: Refine the mobile graph workspace, compact header actions, and dialog close controls.

## 0.21.2

### Patch Changes

- cfa94df: Make the workspace graph-first and usable on narrow viewports.

## 0.21.1

### Patch Changes

- 1542bf9: Report anonymous bulk-analysis progress without changing the workspace canvas layout, and keep safe repository diagnostics visible during incomplete analysis.

## 0.21.0

### Minor Changes

- cd39622: Select GitHub workspace repositories directly from the live UI with progressive graph updates.

## 0.20.0

### Minor Changes

- 61411ec: Expose authenticated workspace inventory and progressive repository-selection HTTP endpoints.

## 0.19.2

### Patch Changes

- 9a6cf29: chore: add canonical repository metadata

## 0.19.1

### Patch Changes

- 2488aa7: Replace PostgreSQL-backed GitHub OAuth storage with encrypted, short-lived host-only cookies.

## 0.19.0

### Minor Changes

- 65a104f: Prepare server-side GitHub OAuth sign-in with secure opaque sessions and ZORA account controls.

## 0.18.2

### Patch Changes

- dcef085: Restore explicit GitHub repository selection before multi-repository materialization.

## 0.18.1

### Patch Changes

- 7d1c237: Migrate the web application to published ZORA web package imports.

## 0.18.0

### Minor Changes

- 4dd7e9a: Assign stable, theme-aware colors to selected repositories in multi-project graph workspaces.

## 0.17.0

### Minor Changes

- 95c288d: Visualize serialized Rules dependency plans and execution evidence in the Atlas Rules workspace panel.

## 0.16.0

### Minor Changes

- 65f6156: Add multi-repository GitHub workspaces for owner sources.

## 0.15.2

### Patch Changes

- 27cb86f: Preserve visible compound descendants and their internal dependency edges when selecting a group.

## 0.15.1

### Patch Changes

- 1eba7cc: Run Atlas TypeScript and React specs with Bun-native Testosterone coverage without direct tsx or c8 dependencies.

## 0.15.0

### Minor Changes

- eb3263b: Accept validated local source JAR archives as analysis input.

## 0.14.3

### Patch Changes

- cc1578e: Consume canonical Utility selection behavior when synchronizing repeated TreeView and GraphView activation.

## 0.14.2

### Patch Changes

- e3cdf9e: Visually distinguish owner-declared nested workspace roots in dependency graphs.

## 0.14.1

### Patch Changes

- e7f9d59: Publish the corrected Atlas CLI documentation for the available `--offline` export.

## 0.14.0

### Minor Changes

- e1d3029: Manage the manifest-declared local online environment through the released Infra lifecycle.

## 0.13.1

### Patch Changes

- 00b0fa7: Bundle the real Atlas React and ZORA workspace into offline HTML exports.

## 0.13.0

### Minor Changes

- 46e0b5b: Unify online and embedded workspace rendering through validated, versioned Atlas snapshots.

## 0.12.1

### Patch Changes

- 0b00743: Migrate the Atlas capability catalog to the current capability APIs.

## 0.12.0

### Minor Changes

- c73d7a3: Publish the Atlas CLI capability catalog through the `@ankhorage/atlas/capabilities` subpath.

## 0.11.0

### Minor Changes

- da31483: Migrate the Atlas web application to the canonical Ankhorage manifest, ZORA app shell, and dependency graph API action.

## 0.10.0

### Minor Changes

- c4a94e5: Add self-contained offline HTML reports for captured Atlas audits.

## 0.9.2

### Patch Changes

- f298d88: Keep project-tree expansion local so opening or closing folders never changes graph navigation.
- 5af6b1f: Restore synchronized TreeView and GraphView multi-selection across desktop modifiers and touch input.

## 0.9.1

### Patch Changes

- b306ab5: Keep architecture detection out of the Rules sidebar and refine workspace navigation using existing ZORA primitives.

## 0.9.0

### Minor Changes

- 376fb17: Add a thin Gradle plugin adapter for Java and Kotlin projects that runs the canonical Atlas audit contract from Gradle verification tasks.
- 8f3a681: Add Ankh audit/view/export commands and local or GitHub repository project sources.
- e5013e0: Rename the package and Ankh provider to Atlas, expose the canonical `audit`, `inspect`, and `export` commands, accept GitHub `owner/repository` shorthand, and add JSON/CSV export format selection.

### Patch Changes

- 9c7d4ce: Rename the hosted page metadata from Package Visualizer to Atlas.
- f873975: Restore exact Explorer row selection, independent folder navigation, and Home-only root scope fallback.
- 367202e: Load `ankhorage/atlas` as the hosted viewer default when no local project environment is configured, while preserving explicit browser-source and local-environment precedence.
- 76748fc: Upgrade Next.js to 16.3.8 for the latest security fixes.
- ac67251: Use one ZORA repository input, accept owner/repository shorthand in the browser, and remove the
  separate GitHub ref syntax in favor of normal GitHub revision URLs.
- 3ab9804: Bootstrap Paradox documentation, complete public package metadata, and fix authenticated ZORA materialization during releases.
- c7f185b: Publish Atlas from the merged `main` branch through npm Trusted Publishing and declare the canonical source repository in package metadata.
- 53e4a4a: Synchronize GraphView and TreeView through one logical workspace selection, including structural descendant resolution.

## v0.7.7 (alpha)

- Improve testing engine

## v0.7.4 (alpha)

- Add Kotlin support

## v0.6.0 (alpha)

- Add Delphi support

## v0.5.0 (alpha)

- Add Python support

## v0.4.0 (alpha)

- Add C++ support

## v0.3.0 (alpha)

- Add Java, TypeScript & JavaScript support
- Auto-detect project language
- Visualize project using Cytoscape
