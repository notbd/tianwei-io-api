import antfu from '@antfu/eslint-config'

export default antfu(
  {
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
    ignores: [
      'dist/**',
      'build/**',
    ],
  },

  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'dir'] }],
    },
  },
)
