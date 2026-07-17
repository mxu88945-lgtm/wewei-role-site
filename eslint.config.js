import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs['recommended-latest'],
  },
  {
    files: ['src/**/*.tsx'],
    ...reactRefresh.configs.vite,
  },
  {
    // These modules intentionally export pure helpers/constants alongside a component.
    files: ['src/MessageContent.tsx', 'src/PetCritter.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
