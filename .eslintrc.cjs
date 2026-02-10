module.exports = {
  root: true,
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/*.d.ts',
    '**/*.tsbuildinfo',
  ],
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: ['eslint:recommended'],
  overrides: [
    {
      files: ['scripts/loadtest/**/*.js'],
      globals: {
        __ENV: 'readonly',
        __ITER: 'readonly',
        __VU: 'readonly',
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    {
      files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@cost-watchdog/api',
                  '@cost-watchdog/api/*',
                  'apps/api/*',
                  '**/apps/api/**',
                  '../api/**',
                  '../../api/**',
                  '../../../api/**',
                  '../../../../api/**',
                ],
                message: 'Web app must not import API app modules.',
              },
              {
                group: [
                  '@cost-watchdog/connectors',
                  '@cost-watchdog/connectors/*',
                  '@cost-watchdog/connector-sdk',
                  '@cost-watchdog/connector-sdk/*',
                ],
                message: 'Web app must not import server-only connector packages.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/api/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@cost-watchdog/web',
                  '@cost-watchdog/web/*',
                  'apps/web/*',
                  '**/apps/web/**',
                  '../web/**',
                  '../../web/**',
                  '../../../web/**',
                  '../../../../web/**',
                ],
                message: 'API app must not import Web app modules.',
              },
            ],
          },
        ],
      },
    },
  ],
};
