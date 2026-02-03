import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['node_modules/**', 'dist/**', 'results/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // 文件大小限制
      'max-lines': [
        'warn',
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],

      // TypeScript 严格规则
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // 代码质量规则
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-duplicate-imports': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'warn',
    },
  },
  // 禁止非 index.ts 文件中的 re-export
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          // 禁止 export { X } from '...' 语法
          selector: 'ExportNamedDeclaration[source]',
          message: 'Re-exports are only allowed in index.ts files. Import directly from source.',
        },
        {
          // 禁止 import 后再 export（无 source 且无 declaration 的 export）
          selector: 'ExportNamedDeclaration:not([source]):not([declaration]) > ExportSpecifier',
          message: 'Re-exports are only allowed in index.ts files. Import directly from source.',
        },
      ],
    },
  }
);
