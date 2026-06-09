import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.js'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['utils/**']
    }
  }
});
