import antfu from '@antfu/eslint-config'

export default antfu(
  {
    stylistic: {
      indent: 2,
      quotes: 'single',
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
)
