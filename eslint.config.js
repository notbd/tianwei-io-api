import antfu from '@antfu/eslint-config'

export default antfu(
  {
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
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
          allow: ['warn', 'error', 'info', 'dir'],
        },
      ],
      // one way to declare object types (unions already need `type`), as in the web repo
      'ts/consistent-type-definitions': ['error', 'type'],
    },
  },

  {
    // Hono types a middleware's context input as `any`, so handing `c` on to
    // logger() and cors() trips this rule although no untyped value flows.
    files: ['src/app.ts'],
    rules: {
      'ts/no-unsafe-argument': 'off',
    },
  },
)
