import { describe, expect, it, resolve } from '@artiphishle/testosterone';

import { getPackageCyclesWithMembers } from '@/features/audit/application/use-cases/getPackageCyclesWithMembers';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';

describe('[package cycles]', () => {
  it('detects the A-B-A package cycle on the canonical package graph', async () => {
    const snapshot = await readProjectSnapshotAsync({
      projectPath: resolve(process.cwd(), 'examples/java/my-app'),
    });
    const result = getPackageCyclesWithMembers(snapshot.files, snapshot.packageGraph);
    const cyclic = Array.from(result.packageSet);

    expect(cyclic.length).toBe(2);
    expect(cyclic.sort()).toEqual(['com.example.myapp.a', 'com.example.myapp.b']);
  });

  it('preserves canonical member evidence for every edge in the cycle', async () => {
    const snapshot = await readProjectSnapshotAsync({
      projectPath: resolve(process.cwd(), 'examples/java/my-app'),
    });
    const details = getPackageCyclesWithMembers(snapshot.files, snapshot.packageGraph);

    expect(details.cycles.length).toBe(1);

    const cycle = details.cycles[0];
    expect(cycle.packages.length).toBe(3);
    expect(cycle.packages[0]).toBe(cycle.packages[2]);

    const aToB = cycle.edges.find(
      edge => edge.from === 'com.example.myapp.a' && edge.to === 'com.example.myapp.b'
    );
    const bToA = cycle.edges.find(
      edge => edge.from === 'com.example.myapp.b' && edge.to === 'com.example.myapp.a'
    );

    expect(aToB?.via.length).toBe(1);
    expect(aToB?.via[0].filePath).toBe('com/example/myapp/a/A.java');
    expect(aToB?.via[0].fileClass).toBe('A');
    expect(aToB?.via[0].importName).toBe('com.example.myapp.b.B');
    expect(aToB?.via[0].isIntrinsic).toBe(true);

    expect(bToA?.via.length).toBe(1);
    expect(bToA?.via[0].filePath).toBe('com/example/myapp/b/B.java');
    expect(bToA?.via[0].fileClass).toBe('B');
    expect(bToA?.via[0].importName).toBe('com.example.myapp.a.A');
    expect(bToA?.via[0].isIntrinsic).toBe(true);
  });
});
