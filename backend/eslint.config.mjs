import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config for the backend.
 *
 * Kept intentionally small: the repo already encodes the important house rules
 * in TypeScript's compiler settings and Vitest. This file only restores the
 * missing lint entrypoint so `npm run lint` has a config to load.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**', 'prisma/schema/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts', 'prisma/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
);
