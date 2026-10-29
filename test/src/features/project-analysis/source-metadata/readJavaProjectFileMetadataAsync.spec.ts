import { assert, describe, expect, it, resolve } from '@artiphishle/testosterone';
import { readJavaProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readJavaProjectFileMetadata';
import { parseProjectPath } from '@/utils/parseProjectPath';

describe('[readJavaProjectFileMetadata]', () => {
  it('parses a .java file correctly', () => {
    process.env.ATLAS_PROJECT_PATH = resolve(process.cwd(), 'examples/java/my-app');
    const projectPath = parseProjectPath();
    const javaFile = resolve(projectPath, 'src/main/java/com/example/myapp/App.java');
    const parsedJavaFile = readJavaProjectFileMetadata(javaFile, projectPath, [
      {
        name: 'com.example.myapp.a.A',
        pkg: 'com.example.myapp.a',
        isIntrinsic: true,
      },
    ]);

    expect(parsedJavaFile.className).toBe('App');
    expect(parsedJavaFile.imports.length).toBe(1);
    expect(parsedJavaFile.package).toBe('com.example.myapp');
    expect(parsedJavaFile.path).toBe('src/main/java/com/example/myapp/App.java');
  });

  it('rejects file reads outside the selected project root', () => {
    const projectPath = resolve(process.cwd(), 'examples/java/my-app');

    assert.throws(
      () =>
        readJavaProjectFileMetadata(resolve(projectPath, '..', 'outside.java'), projectPath, []),
      /Path escaped the allowed root/
    );
  });
});
