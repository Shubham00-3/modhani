import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'src/context/AppContext.jsx',
    'src/components/layout/Sidebar.jsx',
    'src/components/layout/TopBar.jsx',
    'src/pages/AuditTrail.jsx',
    'src/pages/OrdersInvoicing.jsx',
    'src/pages/Overview.jsx',
    'src/pages/ProductionBatches.jsx',
    'src/pages/Reports.jsx',
    'src/pages/Settings.jsx',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
