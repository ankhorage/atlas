/*** Returns the user-facing PKGViz CLI help text. */
export function getPkgvizHelp(): string {
  return `
Canonical Ankh commands:
  ankh pkgviz audit [source] [options]
  ankh pkgviz view [source] [options]
  ankh pkgviz export [source] --offline --out <file>

Legacy binary:
  bunx pkgviz [source] [options]

Sources:
  <path>              Local project path (default: current working directory)
  https://github.com/<owner>/<repo>
                      Public GitHub repository materialized for analysis
  --ref <ref>         GitHub branch, tag, or commit (default: repository default branch)

Options:
  -o, --out <file>    Output file (default: audit.json in caller's cwd)
  --open              Open the viewer UI after export
  --serve             Keep server running after export
  --offline           Request the self-contained HTML export owned by pkgviz #261
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
  - Local and GitHub sources use the same ProjectInspection, SourceGraph, Audit, and viewer pipeline.
  - GitHub repositories are analyzed at an immutable resolved commit and cleaned up after use.
  - The audit is written before blocking rules are enforced.
  - Default rule policy: cyclic-dependencies=block.
`;
}
