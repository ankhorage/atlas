import { assert, describe, it } from '@artiphishle/testosterone';
import { detectProject } from '@ankhorage/project-detector';
import { selectParserLanguage } from '@/features/project-analysis/application/use-cases/selectParserLanguage';
import { Language } from '@/types/language';

describe('atlas parser selection', () => {
  for (const [file, language] of [
    ['src/main.ts', Language.TypeScript],
    ['src/main/java/Main.java', Language.Java],
    ['src/main.cpp', Language.Cpp],
    ['app/main.py', Language.Python],
    ['Source/Main.pas', Language.Delphi],
    ['src/main/kotlin/Main.kt', Language.Kotlin],
  ] as const) {
    it(`selects the ${language} parser from canonical evidence`, () => {
      const result = selectParserLanguage(detectProject({ files: [file] }));
      assert.equal(result.language, language);
      assert.deepEqual(result.indicators, [file]);
      assert.equal('confidence' in result, false);
    });
  }

  it('does not select an unsupported JavaScript parser over TypeScript', () => {
    const result = selectParserLanguage(
      detectProject({
        files: ['package.json', 'config.js', 'other.js', 'src/main.ts'],
      })
    );
    assert.equal(result.language, Language.TypeScript);
    assert.equal(result.candidates.length, 2);
  });

  it('retains polyglot evidence and selects deterministically without mutating input', () => {
    const detection = detectProject({ files: ['a.py', 'b.py', 'a.ts'] });
    const before = JSON.stringify(detection.languages);
    assert.equal(selectParserLanguage(detection).language, Language.Python);
    assert.equal(selectParserLanguage(detection).candidates.length, 2);
    assert.equal(JSON.stringify(detection.languages), before);
    assert.equal(
      selectParserLanguage(detectProject({ files: ['a.py', 'a.ts'] })).language,
      Language.TypeScript
    );
    assert.equal(
      selectParserLanguage(detectProject({ files: ['a.ts', 'a.py'] })).language,
      Language.TypeScript
    );
  });

  it('rejects unknown and unsupported-only projects instead of guessing a parser', () => {
    assert.throws(() => selectParserLanguage(detectProject({})), /No supported parser/);
    assert.throws(() => selectParserLanguage(detectProject({ files: ['main.js'] })), /javascript/);
    assert.throws(() => selectParserLanguage(detectProject({ files: ['Makefile'] })), /unknown/);
  });
});
