// eslint.config.mjs
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Global ignores must live in a standalone config object (no `files`),
  // otherwise flat-config only scopes the ignore to that single entry.
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // 放寬常見警告
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      semi: ['warn', 'never'],
      quotes: ['warn', 'single'],
    },
  },
)
