import { describe, expect, it } from '@artiphishle/testosterone';
import { getProjectName } from '@/utils/getProjectName';

describe('[getProjectName]', () => {
  it('should get the project name from projectPath', () => {
    process.env.ATLAS_PROJECT_PATH = '/Users/tester/examples/typescript/my-app';
    expect(getProjectName()).toBe('my-app');
  });
});
