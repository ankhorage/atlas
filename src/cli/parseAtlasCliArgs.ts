import {
  type ArchitectureModel,
  type ArchitectureProfile,
  listArchitectureModels,
  listArchitectureProfiles,
} from '@ankhorage/rules-architecture';

import type { AuditArchitectureTarget, AuditRuleConfiguration } from '@/types/audit';
import type { AtlasCliOptions } from '@/types/cli';

/*** Parse Atlas command-line arguments into immutable CLI options. */
export function parseAtlasCliArgs(argv: readonly string[]): AtlasCliOptions {
  return parseTokens(argv.slice(2), DEFAULT_OPTIONS);
}

const DEFAULT_OPTIONS: AtlasCliOptions = {
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

type FlagUpdater = (options: AtlasCliOptions) => AtlasCliOptions;
type ValueUpdater = (options: AtlasCliOptions, value: string) => AtlasCliOptions;

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
  ['--json', options => withExportFormat(options, 'json')],
  ['--csv', options => withExportFormat(options, 'csv')],
  ['--offline', options => withExportFormat(options, 'offline')],
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
function parseTokens(tokens: readonly string[], options: AtlasCliOptions): AtlasCliOptions {
  if (tokens.length === 0) return options;

  const [argument] = tokens;
  const rest = tokens.slice(1);
  const flagUpdater = FLAG_UPDATERS.get(argument);
  if (flagUpdater !== undefined) return parseTokens(rest, flagUpdater(options));

  const valueUpdater = VALUE_UPDATERS.get(argument);
  if (valueUpdater === undefined) {
    if (argument.startsWith('-')) throw new Error(`Unknown option "${argument}".`);
    if (options.source !== undefined) throw new Error('Only one project source may be provided.');
    return parseTokens(rest, { ...options, source: argument });
  }

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
  options: AtlasCliOptions,
  architectureTarget: AuditArchitectureTarget
): AtlasCliOptions {
  if (options.architectureTarget !== undefined) {
    throw new Error('Choose either --architecture-model or --architecture-profile exactly once.');
  }
  return { ...options, architectureTarget };
}

/*** Accept at most one explicit export format flag per invocation. */
function withExportFormat(
  options: AtlasCliOptions,
  exportFormat: NonNullable<AtlasCliOptions['exportFormat']>
): AtlasCliOptions {
  if (options.exportFormat !== undefined) {
    throw new Error('Choose only one of --json, --csv, or --offline.');
  }
  return { ...options, exportFormat };
}
