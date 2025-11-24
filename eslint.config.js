import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'n/prefer-global/process': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'info', 'dir'] }],
  },
})
