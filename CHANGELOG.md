# Changelog

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
