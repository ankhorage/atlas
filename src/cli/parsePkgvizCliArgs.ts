import {
  type ArchitectureModel,
  type ArchitectureProfile,
  listArchitectureModels,
  listArchitectureProfiles,
} from '@ankhorage/rules-architecture';

import type { AuditArchitectureTarget, AuditRuleConfiguration } from '@/types/audit';
import type { PkgvizCliOptions } from '@/types/cli';

/*** Parse PKGViz command-line arguments into immutable CLI options. */
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
  ['--architecture-model', (options, value) => withArchitectureTarget(options, modelTarget(value))],
  [
    '--architecture-profile',
    (options, value) => withArchitectureTarget(options, profileTarget(value)),
  ],
]);

/*** Recursively consume CLI tokens without mutable parser state. */
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

/*** Read one required option value and return it together with the unconsumed tail. */
function readRequiredValue(
  option: string,
  tokens: readonly string[]
): readonly [string, ...string[]] {
  if (tokens.length === 0) throw new Error(`${option} requires a value.`);
  return [tokens[0], ...tokens.slice(1)];
}

/*** Parse one CLI audit-rule override without accepting unknown rule IDs or modes. */
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

/*** Resolve one explicit built-in architecture model without using detection results. */
function modelTarget(value: string): AuditArchitectureTarget {
  const model = listArchitectureModels().find(({ id }) => id === value);
  if (model === undefined) throw new Error(`Unknown architecture model "${value}".`);
  return { kind: 'model', id: model.id satisfies ArchitectureModel['id'] };
}

/*** Resolve one explicit architecture profile without inferring project ownership. */
function profileTarget(value: string): AuditArchitectureTarget {
  const profile = listArchitectureProfiles().find(({ id }) => id === value);
  if (profile === undefined) throw new Error(`Unknown architecture profile "${value}".`);
  return { kind: 'profile', id: profile.id satisfies ArchitectureProfile['id'] };
}

/*** Accept exactly one explicit architecture enforcement target per CLI invocation. */
function withArchitectureTarget(
  options: PkgvizCliOptions,
  architectureTarget: AuditArchitectureTarget
): PkgvizCliOptions {
  if (options.architectureTarget !== undefined) {
    throw new Error('Choose either --architecture-model or --architecture-profile exactly once.');
  }
  return { ...options, architectureTarget };
}
