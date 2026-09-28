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
  --exclude-path <pattern>
                      Exclude a project-relative path glob from inspection (repeatable)
  --rule <id>=<mode> Configure a rule as off, audit, or block (repeatable)
  --no-fail-on-rule-violation
                      Never fail only because an audit rule is violated
  -v, --verbose      Verbose logs
  -h, --help         Show help

Behavior:
  - Uses process.cwd() as the project root.
  - Writes the audit before enforcing blocking rules, then exits (unless --open/--serve).
  - Default rule policy: cyclic-dependencies=block.
  - --no-fail-on-rule-violation keeps findings in the audit but returns success.
`;
}
