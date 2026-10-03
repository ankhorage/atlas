export default {
  mode: 'write',
  docs: {
    title: 'Package Visualizer',
    description:
      'Analyze and visualize codebases, dependencies, architecture rules, and audit evidence.',
    usage: {
      entrypoints: ['examples/atlas-cli/main.ts'],
    },
  },
  package: {
    entrypoints: ['src/cli/index.ts'],
  },
  output: {
    dir: 'paradox',
  },
};
