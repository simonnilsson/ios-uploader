const js = require('@eslint/js');
const globals = require('globals');
const stylistic = require('@stylistic/eslint-plugin');
const jsdoc = require('eslint-plugin-jsdoc');

module.exports = [
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
