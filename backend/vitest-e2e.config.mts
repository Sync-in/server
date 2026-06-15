import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.e2e-spec.ts'],
    globals: true,
    root: './',
    testTimeout: 30000,
    typecheck: {
      enabled: true
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage/e2e',
      include: ['src/**/*.controller.{ts,js}']
    }
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' }
    })
  ]
})
