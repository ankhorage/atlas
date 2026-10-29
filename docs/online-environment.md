# Atlas online environment

Atlas has two independent delivery modes. The online Next.js host uses the `local` environment in
`ankh.config.json`; the portable offline report is a self-contained `file://` document and neither
starts nor contacts Infra.

The local environment selects the published `local` compute adapter and `minikube` runtime adapter.
Its API declaration is the canonical `dependency-graph` action served by the existing Next.js route.
No second deployment manifest or Atlas-specific infrastructure implementation exists.

The manifest owns one public `atlas-web` workload through the published `InfraWorkloadSpec`. It
uses the local `atlas-web:local` production image, exposes its HTTP listener on port 3000, and
waits for `GET /` readiness. Infra loads that existing image into Minikube, reconciles its
Kubernetes Deployment and Service, and reports the reachable endpoint. The image includes a small
Atlas fixture at `/workspace`; the manifest supplies that path through `ATLAS_PROJECT_PATH`, so no
host path, credential, or browser-provided filesystem path is part of deployment intent.

Build the image before any mutating lifecycle operation:

`bun run image:build`

Image construction is deliberately separate from the Infra lifecycle. The multi-stage Dockerfile
creates a standalone production Next.js server with its static assets and the trusted fixture;
Infra consumes the already available image and never builds application source.

From the repository root, use the released `@ankhorage/infra` project lifecycle through Atlas's thin
path adapter:

- `bun run infra:validate` validates the manifest and selected adapters without mutation.
- `bun run infra:plan` calculates the local environment plan without mutation.
- `bun run infra:generate` writes the deterministic local-host ledger under `.ankh/`.
- `bun run infra:up` creates or reconciles only the local Minikube resources declared by the
  manifest. It requires a locally available `atlas-web:local` image and may start Minikube.
- `bun run infra:status` reads the current local lifecycle state.

`down` and `destroy` are intentionally not exposed as Atlas package scripts because they remove
local resources and require an explicit operator workflow. No CI or pull request should run them,
and no production provider or remote infrastructure is configured by the Atlas manifest.

For online development, set `ATLAS_PROJECT_PATH` to the trusted server-side project directory and
start Next.js with `bun run dev` or `bun run start` after a production build. The browser talks only
to `POST /api/dependency-graph`; project paths never cross the browser boundary. Do not derive API
origins from `Host` headers.

To roll back generated local state, stop using the generated artifacts and remove only the matching
`.ankh/` state through the published Infra lifecycle after inspecting its plan. This does not affect
an exported offline `index.html`.
