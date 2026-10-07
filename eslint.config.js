import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config(
  { ignores: ['**/dist/**', '**/generated/**', '**/node_modules/**', '**/public/sw.js'] },
  js.configs.recommended, ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.serviceworker } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error' } }
);
