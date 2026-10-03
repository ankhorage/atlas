import { assert, describe, it } from '@artiphishle/testosterone';

import { parseAtlasCliArgs } from '@/cli/parseAtlasCliArgs';

describe('[parseAtlasCliArgs]', () => {
  it('returns the existing audit defaults without an architecture target', () => {
    assert.deepEqual(parseAtlasCliArgs(['bun', 'atlas']), {
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
    });
  });

  it('parses viewer, output, rule, and explicit architecture model options', () => {
    assert.deepEqual(
      parseAtlasCliArgs([
        'bun',
        'atlas',
        '--out',
        'reports/audit.json',
        '--open',
        '--serve',
        '--prod',
        '--port',
        '4040',
        '--wait',
        '12000',
        '--no-pretty',
        '--rule',
        'cyclic-dependencies=audit',
        '--architecture-model',
        'hexagonal',
        '--no-fail-on-rule-violation',
        '--verbose',
        'https://github.com/ankhorage/zora/tree/main',
      ]),
      {
        architectureTarget: { kind: 'model', id: 'hexagonal' },
        out: 'reports/audit.json',
        open: true,
        serve: true,
        prod: true,
        port: 4040,
        waitMs: 12_000,
        pretty: false,
        verbose: true,
        failOnRuleViolation: false,
        help: false,
        source: 'https://github.com/ankhorage/zora/tree/main',
        rules: [{ id: 'cyclic-dependencies', mode: 'audit' }],
      }
    );
  });

  it('parses an explicit project profile independently from detection', () => {
    assert.deepEqual(parseAtlasCliArgs(['bun', 'atlas', '--architecture-profile', 'ankhorage']), {
      architectureTarget: { kind: 'profile', id: 'ankhorage' },
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
    });
  });

  it('parses explicit export formats with JSON remaining the implicit default', () => {
    assert.equal(parseAtlasCliArgs(['bun', 'atlas', './project']).exportFormat, undefined);
    assert.equal(parseAtlasCliArgs(['bun', 'atlas', './project', '--json']).exportFormat, 'json');
    assert.equal(parseAtlasCliArgs(['bun', 'atlas', './project', '--csv']).exportFormat, 'csv');
    assert.equal(
      parseAtlasCliArgs(['bun', 'atlas', './project', '--offline']).exportFormat,
      'offline'
    );
  });

  it('rejects multiple export formats', () => {
    assert.throws(
      () => parseAtlasCliArgs(['bun', 'atlas', '--json', '--csv']),
      /Choose only one/
    );
    assert.throws(
      () => parseAtlasCliArgs(['bun', 'atlas', '--csv', '--offline']),
      /Choose only one/
    );
  });

  it('rejects multiple sources and the removed ref option', () => {
    assert.throws(
      () => parseAtlasCliArgs(['bun', 'atlas', './one', './two']),
      /Only one project source/
    );
    assert.throws(
      () => parseAtlasCliArgs(['bun', 'atlas', '--ref', 'main']),
      /Unknown option "--ref"/
    );
  });

  it('recognizes help without performing process I/O', () => {
    assert.equal(parseAtlasCliArgs(['bun', 'atlas', '--help']).help, true);
  });

  it('rejects malformed or unknown audit rule overrides', () => {
    const invalidMode = () =>
      parseAtlasCliArgs(['bun', 'atlas', '--rule', 'cyclic-dependencies=warn']);
    const unknownRule = () => parseAtlasCliArgs(['bun', 'atlas', '--rule', 'unknown=block']);
    const missingRule = () => parseAtlasCliArgs(['bun', 'atlas', '--rule']);

    assert.throws(invalidMode, /Invalid mode/);
    assert.throws(unknownRule, /Unknown audit rule/);
    assert.throws(missingRule, /--rule requires a value/);
  });

  it('rejects unknown or multiple architecture targets', () => {
    const unknownModel = () =>
      parseAtlasCliArgs(['bun', 'atlas', '--architecture-model', 'invented']);
    const unknownProfile = () =>
      parseAtlasCliArgs(['bun', 'atlas', '--architecture-profile', 'invented']);
    const multipleTargets = () =>
      parseAtlasCliArgs([
        'bun',
        'atlas',
        '--architecture-model',
        'clean',
        '--architecture-profile',
        'ankhorage',
      ]);

    assert.throws(unknownModel, /Unknown architecture model/);
    assert.throws(unknownProfile, /Unknown architecture profile/);
    assert.throws(multipleTargets, /Choose either --architecture-model or --architecture-profile/);
  });
});
