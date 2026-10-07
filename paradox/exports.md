# Public API

## createAtlasRuntimeProvider

Kind: `function`
Module: `src/cli/provider/createAtlasRuntimeProvider.ts`
Source: `src/cli/provider/createAtlasRuntimeProvider.ts:12:1`

Create the Ankh runtime provider for Atlas audit, inspect, and offline-export commands.

### Signatures

- `() => { id: string; category: string; version: string; capabilities: readonly [{ readonly id: "atlas.audit"; readonly owner: "@ankhorage/atlas"; readonly access: readonly ["invoke"]; readonly binding: { readonly kind: "action"; readonly bindableAs: readonly ["target"]; }; readonly label: "Audit project architecture"; readonly description: "Create an Atlas audit from a local path or GitHub repository."; }, { readonly id: "atlas.inspect"; readonly owner: "@ankhorage/atlas"; readonly access: readonly ["invoke"]; readonly binding: { readonly kind: "action"; readonly bindableAs: readonly ["target"]; }; readonly label: "Inspect project dependencies"; readonly description: "Open the Atlas graph inspector for a local path or GitHub repository."; }, { readonly id: "atlas.export"; readonly owner: "@ankhorage/atlas"; readonly access: readonly ["invoke"]; readonly binding: { readonly kind: "action"; readonly bindableAs: readonly ["target"]; }; readonly label: "Export Atlas report"; readonly description: "Export a portable Atlas report artifact."; }]; commands: ({ path: string[]; capability: "atlas.audit"; summary: string; } | { path: string[]; capability: "atlas.inspect"; summary: string; } | { path: string[]; capability: "atlas.export"; summary: string; })[]; handlers: { path: string[]; handler: typeof audit; }[]; }`
  - returns: `{ id: string; category: string; version: string; capabilities: readonly [{ readonly id: "atlas.audit"; readonly owner: "@ankhorage/atlas"; readonly access: readonly ["invoke"]; readonly binding: { readonly kind: "action"; readonly bindableAs: readonly ["target"]; }; readonly label: "Audit project architecture"; readonly description: "Create an Atlas audit from a local path or GitHub repository."; }, { readonly id: "atlas.inspect"; readonly owner: "@ankhorage/atlas"; readonly access: readonly ["invoke"]; readonly binding: { readonly kind: "action"; readonly bindableAs: readonly ["target"]; }; readonly label: "Inspect project dependencies"; readonly description: "Open the Atlas graph inspector for a local path or GitHub repository."; }, { readonly id: "atlas.export"; readonly owner: "@ankhorage/atlas"; readonly access: readonly ["invoke"]; readonly binding: { readonly kind: "action"; readonly bindableAs: readonly ["target"]; }; readonly label: "Export Atlas report"; readonly description: "Export a portable Atlas report artifact."; }]; commands: ({ path: string[]; capability: "atlas.audit"; summary: string; } | { path: string[]; capability: "atlas.inspect"; summary: string; } | { path: string[]; capability: "atlas.export"; summary: string; })[]; handlers: { path: string[]; handler: typeof audit; }[]; }`

## provider

Kind: `value`
Module: `src/cli/index.ts`
Source: `src/cli/index.ts:3:7`
