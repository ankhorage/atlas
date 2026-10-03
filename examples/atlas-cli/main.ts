/***
 * Analyze either a local project or a public GitHub repository through the same Atlas pipeline.
 *
 * The canonical CLI surface is exposed through Ankh. Use `audit` for rule evaluation,
 * `inspect` for the interactive graph, and `export` for JSON, CSV, or the future offline report.
 *
 * @title Analyze a project
 * @usage
 * @readme
 */
export const commands = [
  'ankh atlas audit .',
  'ankh atlas audit ankhorage/zora',
  'ankh atlas audit https://github.com/ankhorage/zora',
  'ankh atlas inspect .',
  'ankh atlas inspect ankhorage/zora',
  'ankh atlas export .',
  'ankh atlas export . --csv',
  'ankh atlas export . --offline',
] as const;
