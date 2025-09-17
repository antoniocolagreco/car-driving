import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import unicorn from 'eslint-plugin-unicorn'

/** @type {Linter.FlatConfig[]} */
export default [
    {
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['dist/**', '.astro/**', 'node_modules/**'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2023,
                sourceType: 'module',
                project: false,
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            unicorn,
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'unicorn/filename-case': [
                'error',
                {
                    case: 'kebabCase',
                },
            ],
            // ✅ Force curly braces for all control statements
            curly: ['error', 'all'],
            // ✅ Consistent brace style
            'brace-style': ['error', '1tbs', { allowSingleLine: false }],
            // ✅ No single line blocks
            'nonblock-statement-body-position': ['error', 'below'],
        },
    },
]
