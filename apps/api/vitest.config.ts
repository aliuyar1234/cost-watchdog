import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        'prisma/',
        'src/workers/**', // Workers have different test strategy
        'src/connectors/**', // Connector SDK tested separately
      ],
      // Enterprise-grade coverage thresholds
      thresholds: {
        // Overall thresholds
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
        // Critical paths require higher coverage
        perFile: false, // Set to true later for stricter enforcement
      },
    },
    setupFiles: ['./tests/setup.ts'],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
