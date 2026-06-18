import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist']
  }
});
