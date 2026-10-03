# Public API

## createAtlasRuntimeProvider

Kind: `function`
Module: `src/cli/provider/createAtlasRuntimeProvider.ts`
Source: `src/cli/provider/createAtlasRuntimeProvider.ts:8:1`

Create the Ankh runtime provider for Atlas audit, inspect, and offline-export commands.

### Signatures

- `() => { readonly id: "atlas"; readonly category: "atlas"; readonly version: string; readonly capabilities: readonly ["atlas.audit", "atlas.inspect", "atlas.export"]; readonly commands: readonly [{ readonly path: readonly ["audit"]; readonly capability: "atlas.audit"; readonly summary: "Create an Atlas audit from a local path or GitHub repository."; }, { readonly path: readonly ["inspect"]; readonly capability: "atlas.inspect"; readonly summary: "Open the Atlas graph inspector for a local path or GitHub repository."; }, { readonly path: readonly ["export"]; readonly capability: "atlas.export"; readonly summary: "Export a portable Atlas report artifact."; }]; readonly handlers: readonly [{ readonly path: readonly ["audit"]; readonly handler: typeof audit; }, { readonly path: readonly ["inspect"]; readonly handler: typeof inspect; }, { readonly path: readonly ["export"]; readonly handler: typeof runExportCommand; }]; }`
  - returns: `{ readonly id: "atlas"; readonly category: "atlas"; readonly version: string; readonly capabilities: readonly ["atlas.audit", "atlas.inspect", "atlas.export"]; readonly commands: readonly [{ readonly path: readonly ["audit"]; readonly capability: "atlas.audit"; readonly summary: "Create an Atlas audit from a local path or GitHub repository."; }, { readonly path: readonly ["inspect"]; readonly capability: "atlas.inspect"; readonly summary: "Open the Atlas graph inspector for a local path or GitHub repository."; }, { readonly path: readonly ["export"]; readonly capability: "atlas.export"; readonly summary: "Export a portable Atlas report artifact."; }]; readonly handlers: readonly [{ readonly path: readonly ["audit"]; readonly handler: typeof audit; }, { readonly path: readonly ["inspect"]; readonly handler: typeof inspect; }, { readonly path: readonly ["export"]; readonly handler: typeof runExportCommand; }]; }`

## provider

Kind: `value`
Module: `src/cli/index.ts`
Source: `src/cli/index.ts:3:7`
