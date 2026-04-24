import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        'src/**/*.module.css',
      ],
      thresholds: {
        'src/app/api/auth/nonce/route.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/app/api/auth/verify/route.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
