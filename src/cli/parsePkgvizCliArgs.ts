import type { AuditRuleConfiguration } from '@/types/audit';
import type { PkgvizCliOptions } from '@/types/cli';

/*** Parses PKGViz command-line arguments into immutable CLI options. */
export function parsePkgvizCliArgs(argv: readonly string[]): PkgvizCliOptions {
  return parseTokens(argv.slice(2), DEFAULT_OPTIONS);
}

const DEFAULT_OPTIONS: PkgvizCliOptions = {
  out: 'audit.json',
  open: false,
  serve: false,
  prod: false,
  waitMs: 90_000,
  pretty: true,
  verbose: false,
  failOnRuleViolation: true,
  help: false,
  excludePaths: [],
  rules: [],
};

type FlagUpdater = (options: PkgvizCliOptions) => PkgvizCliOptions;
type ValueUpdater = (options: PkgvizCliOptions, value: string) => PkgvizCliOptions;

const FLAG_UPDATERS = new Map<string, FlagUpdater>([
  ['--open', options => ({ ...options, open: true })],
  ['--serve', options => ({ ...options, serve: true })],
  ['--prod', options => ({ ...options, prod: true })],
  ['--no-pretty', options => ({ ...options, pretty: false })],
  ['--no-fail-on-rule-violation', options => ({ ...options, failOnRuleViolation: false })],
  ['-v', options => ({ ...options, verbose: true })],
  ['--verbose', options => ({ ...options, verbose: true })],
  ['-h', options => ({ ...options, help: true })],
  ['--help', options => ({ ...options, help: true })],
]);

const VALUE_UPDATERS = new Map<string, ValueUpdater>([
  ['-o', (options, value) => ({ ...options, out: value })],
  ['--out', (options, value) => ({ ...options, out: value })],
  ['-p', (options, value) => ({ ...options, port: Number(value) })],
  ['--port', (options, value) => ({ ...options, port: Number(value) })],
  ['--wait', (options, value) => ({ ...options, waitMs: Number(value) })],
  [
    '--rule',
    (options, value) => ({
      ...options,
      rules: [...options.rules, parseRuleConfiguration(value)],
    }),
  ],
  [
    '--exclude-path',
    (options, value) => ({ ...options, excludePaths: [...options.excludePaths, value] }),
  ],
]);

/*** Recursively consumes CLI tokens without mutable parser state. */
function parseTokens(tokens: readonly string[], options: PkgvizCliOptions): PkgvizCliOptions {
  if (tokens.length === 0) return options;

  const [argument] = tokens;
  const rest = tokens.slice(1);
  const flagUpdater = FLAG_UPDATERS.get(argument);
  if (flagUpdater !== undefined) return parseTokens(rest, flagUpdater(options));

  const valueUpdater = VALUE_UPDATERS.get(argument);
  if (valueUpdater === undefined) return parseTokens(rest, options);

  const [value, ...tail] = readRequiredValue(argument, rest);
  return parseTokens(tail, valueUpdater(options, value));
}

/*** Reads one required option value and returns it together with the unconsumed tail. */
function readRequiredValue(
  option: string,
  tokens: readonly string[]
): readonly [string, ...string[]] {
  if (tokens.length === 0) throw new Error(`${option} requires a value.`);
  return [tokens[0], ...tokens.slice(1)];
}

/*** Parses one CLI audit-rule override without accepting unknown rule IDs or modes. */
function parseRuleConfiguration(value: string): AuditRuleConfiguration {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid --rule value "${value}". Expected <id>=<off|audit|block>.`);
  }

  const id = value.slice(0, separator);
  const mode = value.slice(separator + 1);
  if (id !== 'cyclic-dependencies') throw new Error(`Unknown audit rule "${id}".`);
  if (mode !== 'off' && mode !== 'audit' && mode !== 'block') {
    throw new Error(`Invalid mode "${mode}" for rule "${id}".`);
  }

  return { id, mode };
}
