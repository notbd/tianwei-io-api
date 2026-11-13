import antfu from '@antfu/eslint-config'

export default antfu(
  {
    // Type-aware rules. Each file is checked against its nearest tsconfig
    // (src: the Worker's; test/ and scripts/: their own). vitest.config.ts
    // belongs to test/tsconfig.json, which that lookup never reaches from the
    // root, so it gets the plain rules (tsc -p test still checks it).
    typescript: {
      tsconfigPath: 'tsconfig.json',
      ignoresTypeAware: ['**/*.md/**', 'vitest.config.ts'],
    },
    ignores: ['worker-configuration.d.ts'],
  },

  {
    rules: {
      'no-console': [
        'error',
        {
          allow: ['warn', 'error', 'info'],
        },
      ],
      // one way to declare object types (unions already need `type`), as in the web repo
      'ts/consistent-type-definitions': ['error', 'type'],
    },
  },

  {
    // a test asserts what it got instead of asserting it is there
    files: ['test/**'],
    rules: {
      'ts/no-non-null-assertion': 'error',
    },
  },
)
