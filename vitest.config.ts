import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: [
      'node_modules/**',
      'tests/api/commitments.test.ts',
      'tests/api/health.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/backend/**/*.ts',
        'src/utils/**/*.ts',
      ],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        'src/**/*.module.css',
        'src/**/*.d.ts',
        'src/lib/backend/services/contracts.ts',
      ],
      thresholds: {
        lines: 19,
        functions: 14,
        branches: 14,
        statements: 19,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
