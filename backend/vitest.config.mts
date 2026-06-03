import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
    root: './',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage/units',
      exclude: [
        '**/*-controller.service.{ts,js}',
        '**/*-queries.service.{ts,js}',
        '**/*-scheduler.service.{ts,js}',
        'dist/**',
        'node_modules/**'
      ]
    }
  },
  plugins: [
    swc.vite({
      module: {type: 'es6'}
    })
  ]
})
