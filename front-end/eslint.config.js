import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * ESLint 扁平配置（ESLint 9）。
 * 规则只聚焦“能直接变成 bug”的问题，不引入格式类规则（格式交给 prettier）：
 * - no-undef：未定义变量（如漏了 import / 写错变量名）
 * - react-hooks：Hook 调用规则与依赖数组
 * - react/jsx-key：列表渲染缺 key
 * - no-unused-vars：未使用的变量（warn，不阻塞构建）
 */
export default [
  { ignores: ['dist/**', 'web/**', 'node_modules/**'] },
  // vite.config.js 运行于 Node 环境（Vite 加载配置时执行），补充 Node 全局变量避免 no-undef
  {
    files: ['vite.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/no-unknown-property': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
