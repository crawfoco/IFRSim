import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'data', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The simulation core must stay free of React and the DOM (SPEC.md Boundaries).
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'react/*', 'react-dom/*', '**/ui/**'] },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
    },
  },
);
