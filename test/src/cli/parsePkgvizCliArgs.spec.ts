import { assert, describe, it } from '@artiphishle/testosterone';

import { parsePkgvizCliArgs } from '@/cli/parsePkgvizCliArgs';

describe('[parsePkgvizCliArgs]', () => {
  it('returns the existing audit defaults without an architecture target', () => {
    assert.deepEqual(parsePkgvizCliArgs(['bun', 'pkgviz']), {
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
      parsePkgvizCliArgs([
        'bun',
        'pkgviz',
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
        rules: [{ id: 'cyclic-dependencies', mode: 'audit' }],
      },
    );
  });

  it('parses an explicit project profile independently from detection', () => {
    assert.deepEqual(
      parsePkgvizCliArgs(['bun', 'pkgviz', '--architecture-profile', 'ankhorage']),
      {
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
      },
    );
  });

  it('recognizes help without performing process I/O', () => {
    assert.equal(parsePkgvizCliArgs(['bun', 'pkgviz', '--help']).help, true);
  });

  it('rejects malformed or unknown audit rule overrides', () => {
    const invalidMode = () =>
      parsePkgvizCliArgs(['bun', 'pkgviz', '--rule', 'cyclic-dependencies=warn']);
    const unknownRule = () => parsePkgvizCliArgs(['bun', 'pkgviz', '--rule', 'unknown=block']);
    const missingRule = () => parsePkgvizCliArgs(['bun', 'pkgviz', '--rule']);

    assert.throws(invalidMode, /Invalid mode/);
    assert.throws(unknownRule, /Unknown audit rule/);
    assert.throws(missingRule, /--rule requires a value/);
  });

  it('rejects unknown or multiple architecture targets', () => {
    const unknownModel = () =>
      parsePkgvizCliArgs(['bun', 'pkgviz', '--architecture-model', 'invented']);
    const unknownProfile = () =>
      parsePkgvizCliArgs(['bun', 'pkgviz', '--architecture-profile', 'invented']);
    const multipleTargets = () =>
      parsePkgvizCliArgs([
        'bun',
        'pkgviz',
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
