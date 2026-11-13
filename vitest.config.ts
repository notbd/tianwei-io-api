import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    // PGlite boots in a beforeAll; on a loaded machine that alone can pass the 10 s default
    hookTimeout: 60_000,
  },
})
