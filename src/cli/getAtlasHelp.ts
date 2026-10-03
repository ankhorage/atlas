/*** Returns the user-facing Atlas CLI help text. */
export function getAtlasHelp(): string {
  return `
Canonical Ankh commands:
  ankh atlas audit [source] [options]
  ankh atlas inspect [source] [options]
  ankh atlas export [source] --offline --out <file>

Standalone binary:
  bunx @ankhorage/atlas [source] [options]

Sources:
  <path>              Local project path (default: current working directory)
  <owner>/<repo>      Public GitHub repository shorthand
  https://github.com/<owner>/<repo>
                      Public GitHub repository materialized for analysis
  https://github.com/<owner>/<repo>/tree/<branch>
                      Normal GitHub tree/blob/commit URLs select their own revision

Options:
  -o, --out <file>    Output file (default: audit.json in caller's cwd)
  --open              Open the viewer UI after export
  --serve             Keep the standalone viewer running after export
  --offline           Request the self-contained HTML export owned by Atlas #261
  --prod              Use "next start" if a build exists inside the package
  -p, --port <n>      Port to use (default: find free)
  --wait <ms>         Max wait for server & route (default: 90000)
  --no-pretty         Write minified JSON
  --rule <id>=<mode>  Configure a rule as off, audit, or block (repeatable)
  --architecture-model <id>
                      Explicit target: hexagonal, clean, onion, or layered
  --architecture-profile <id>
                      Explicit project profile target (currently: ankhorage)
  --no-fail-on-rule-violation
                      Never fail only because an audit rule is violated
  -v, --verbose       Verbose logs
  -h, --help          Show help

Behavior:
  - Local paths and GitHub sources use the same ProjectInspection, SourceGraph, Audit, and viewer pipeline.
  - `inspect` opens the interactive viewer and keeps its local server running until the process exits.
  - GitHub repositories are analyzed at an immutable resolved commit and cleaned up after use.
  - GitHub branch, tag, and commit selection comes from normal GitHub URLs; there is no separate ref syntax.
  - The audit is written before blocking rules are enforced.
  - Default rule policy: cyclic-dependencies=block.
`;
}
