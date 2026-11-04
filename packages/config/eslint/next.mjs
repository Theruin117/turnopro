import globals from 'globals';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

const nextRules =
  nextPlugin.configs?.['core-web-vitals']?.rules ??
  nextPlugin.configs?.recommended?.rules ??
  {};

const reactHooksRules =
  reactHooks.configs?.flat?.recommended?.rules ??
  reactHooks.configs?.recommended?.rules ??
  {};

export default [
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextRules,
      ...reactHooksRules,
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
