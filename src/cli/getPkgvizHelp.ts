/*** Returns the user-facing PKGViz CLI help text. */
export function getPkgvizHelp(): string {
  return `
Usage:
  bunx pkgviz [options]

Options:
  -o, --out <file>   Output file (default: audit.json in caller's cwd)
  --open             Open the viewer UI after export
  --serve            Keep server running after export (implies --open unless exporting only)
  --prod             Use "next start" if a build exists inside the package
  -p, --port <n>     Port to use (default: find free)
  --wait <ms>        Max wait for server & route (default: 90000)
  --no-pretty        Write minified JSON
  --rule <id>=<mode> Configure a rule as off, audit, or block (repeatable)
  --architecture-model <id>
                      Explicit target: hexagonal, clean, onion, or layered
  --architecture-profile <id>
                      Explicit project profile target (currently: ankhorage)
  --no-fail-on-rule-violation
                      Never fail only because an audit rule is violated
  -v, --verbose      Verbose logs
  -h, --help         Show help

Behavior:
  - Uses process.cwd() as the project root.
  - Writes the audit before enforcing blocking rules, then exits (unless --open/--serve).
  - Default rule policy: cyclic-dependencies=block.
  - Architecture detection never selects an enforcement target.
  - Architecture evaluation runs only when --architecture-model or --architecture-profile is set.
  - --no-fail-on-rule-violation keeps findings in the audit but returns success.
`;
}
