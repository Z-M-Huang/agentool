import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            thresholds: {
              lines: 95,
              functions: 95,
              branches: 90,
              statements: 95,
            },
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/shared/types.ts'],
          },
        },
      },
      {
        test: {
          name: 'functional',
          include: ['tests/functional/**/*.test.ts'],
          testTimeout: 60000,
        },
      },
    ],
  },
});
