# Atlas online environment

Atlas has two independent delivery modes. The online Next.js host uses the `local` environment in
`ankh.config.json`; the portable offline report is a self-contained `file://` document and neither
starts nor contacts Infra.

The local environment selects the published `local` compute adapter and `minikube` runtime adapter.
Its API declaration is the canonical `dependency-graph` action served by the existing Next.js route.
No second deployment manifest or Atlas-specific infrastructure implementation exists.

From the repository root, use the released `@ankhorage/infra` project lifecycle through Atlas's thin
path adapter:

- `bun run infra:validate` validates the manifest and selected adapters without mutation.
- `bun run infra:plan` calculates the local environment plan without mutation.
- `bun run infra:generate` writes deterministic review artifacts and local Infra state under `.ankh/`.
- `bun run infra:status` reads the current local lifecycle state.

`up`, `down`, and `destroy` are intentionally not exposed as Atlas package scripts. They can change
the local Minikube runtime or remove resources and require an explicit operator workflow. No CI or
pull request should run them, and no production provider or remote infrastructure is configured by
the Atlas manifest.

For online development, set `ATLAS_PROJECT_PATH` to the trusted server-side project directory and
start Next.js with `bun run dev` or `bun run start` after a production build. The browser talks only
to `POST /api/dependency-graph`; project paths never cross the browser boundary. Do not derive API
origins from `Host` headers.

To roll back generated local state, stop using the generated artifacts and remove only the matching
`.ankh/` state through the published Infra lifecycle after inspecting its plan. This does not affect
an exported offline `index.html`.
