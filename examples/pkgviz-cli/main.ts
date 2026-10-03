/***
 * Analyze either a local project or a public GitHub repository through the same PKGViz pipeline.
 *
 * The canonical CLI surface is exposed through Ankh. Use `audit` for portable JSON evidence,
 * `view` for the interactive graph, and `export --offline` for the single-file report once
 * the exporter tracked by pkgviz #261 is available.
 *
 * @title Analyze a project
 * @usage
 * @readme
 */
export const commands = [
  'ankh pkgviz audit .',
  'ankh pkgviz audit https://github.com/ankhorage/zora',
  'ankh pkgviz audit https://github.com/ankhorage/zora --ref main',
  'ankh pkgviz view https://github.com/ankhorage/zora --serve',
  'ankh pkgviz export https://github.com/ankhorage/zora --offline --out pkgviz-report.html',
] as const;
