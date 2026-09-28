import { assert, describe, it } from '@artiphishle/testosterone';

import { parsePkgvizCliArgs } from '@/cli/parsePkgvizCliArgs';

describe('[parsePkgvizCliArgs]', () => {
  it('returns the existing audit defaults', () => {
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
      excludePaths: [],
      rules: [],
    });
  });

  it('parses viewer, output, and repeated audit policy options', () => {
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
        '--exclude-path',
        'generated/**',
        '--exclude-path',
        'metadata-link',
        '--rule',
        'cyclic-dependencies=audit',
        '--rule',
        'cyclic-dependencies=off',
        '--no-fail-on-rule-violation',
        '--verbose',
      ]),
      {
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
        excludePaths: ['generated/**', 'metadata-link'],
        rules: [
          { id: 'cyclic-dependencies', mode: 'audit' },
          { id: 'cyclic-dependencies', mode: 'off' },
        ],
      }
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
});
