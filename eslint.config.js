import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.php', 'tests/**', '*.cjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  n.configs['flat/recommended'],
  promise.configs['flat/recommended'],
  prettier,
  {
    plugins: {
      import: importPlugin,
    },

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },

    rules: {
      'n/no-unpublished-import': 'off',
      'n/no-extraneous-import': 'error',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          version: '>=24.0.0',
          ignores: [],
        },
      ],
      'arrow-spacing': ['warn', { before: true, after: true }],
      'brace-style': 'off',
      'comma-dangle': ['error', 'always-multiline'],
      'comma-spacing': 'error',
      'comma-style': 'error',
      curly: ['error', 'multi-line', 'consistent'],
      'dot-location': ['error', 'property'],
      'handle-callback-err': 'off',

      indent: 'off',

      'keyword-spacing': 'error',
      'max-nested-callbacks': ['error', { max: 4 }],
      'max-statements-per-line': ['error', { max: 3 }],
      'no-console': 'off',
      'no-empty-function': 'error',
      'no-floating-decimal': 'error',
      'no-inline-comments': 'error',
      'no-lonely-if': 'error',
      'no-multi-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],
      'no-shadow': ['error', { allow: ['err', 'resolve', 'reject', 'Client'] }],
      'no-trailing-spaces': ['error'],
      'no-var': 'error',
      'no-undef': 'off',
      'object-curly-spacing': ['error', 'always'],
      'prefer-const': 'error',
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'space-before-blocks': 'error',
      'space-before-function-paren': [
        'error',
        {
          anonymous: 'never',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      'space-in-parens': 'error',
      'space-infix-ops': 'error',
      'space-unary-ops': 'error',
      'spaced-comment': 'error',
      yoda: 'error',

      'no-template-curly-in-string': 'error',
      'no-unreachable-loop': 'error',
      'array-callback-return': 'error',
      'require-await': 'warn',
      'consistent-return': 'warn',
      'prefer-template': 'warn',
      'object-shorthand': ['warn', 'always'],

      'import/first': 'error',
      'import/order': [
        'warn',
        {
          groups: [
            ['builtin', 'external'],
            ['internal', 'parent', 'sibling', 'index'],
          ],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
      'no-duplicate-imports': 'error',
      'n/no-missing-import': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/scripts/**'],
    rules: { 'n/no-process-exit': 'off' },
  },
];
