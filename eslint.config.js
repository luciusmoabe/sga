// Lint enxuto: só o que acha erro de verdade (variável não definida, import sem uso, `==`). Estilo fica de fora.
import globals from 'globals';
import js from '@eslint/js';

const regras = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'no-dupe-keys': 'error',
  'no-redeclare': 'error',
  'no-unreachable': 'error',
};

export default [
  { ignores: ['node_modules/**', 'public/js/vendor/**', 'data/**', 'certs/**', '.xgrok/**', '.vercel/**'] },
  js.configs.recommended,
  { files: ['server/**/*.js', 'test/**/*.js', 'scripts/**/*.{js,mjs}', 'eslint.config.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node }, rules: regras },
  { files: ['public/js/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker } }, rules: regras },
  { files: ['test/e2e/**/*.js', 'scripts/guia/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }], 'no-useless-escape': 'off', 'no-control-regex': 'off', 'no-prototype-builtins': 'off', 'no-cond-assign': ['error', 'except-parens'] } },
];
