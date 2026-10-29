import { describe, expect, it } from '@artiphishle/testosterone';
import { parseProjectPath } from '@/utils/parseProjectPath';

describe('[parseProjectPath]', () => {
  it('normalizes the configured project path', () => {
    expect(parseProjectPath('/Users/tester/examples/typescript/my-app')).toBe(
      '/Users/tester/examples/typescript/my-app'
    );
  });
});
