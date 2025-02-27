import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  js.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    quoteProps: 'as-needed',
    arrowParens: true,
    semi: true,
  }),
  {
    files: ['**/*.js'],
    plugins: {
      jsdoc,
    },
    rules: {
      'jsdoc/no-undefined-types': 1,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
  },
];
