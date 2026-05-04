import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'pipeline/__tests__/**/*.test.ts',
      'src/data-layer/__tests__/**/*.test.ts',
      'src/routes/__tests__/**/*.test.ts',
      'src/utils/__tests__/**/*.test.ts',
      'src/services/__tests__/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'pipeline/__tests__/'],
    },
  },
  resolve: {
    alias: {
      '@api': '.',
    },
  },
});
