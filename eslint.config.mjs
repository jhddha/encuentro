import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'prototypes/**',
      'archive/**',
      'Encuentro_Prototipo_Integral_v2.7.html',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json', './apps/web/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md: sin `any`, sin `ts-ignore`, sin casts injustificados.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // requirements.md §10: los importes usan decimal exacto, nunca `float`.
      'no-loss-of-precision': 'error',
    },
  },

  // Los archivos de configuración no forman parte de ningún tsconfig del build.
  {
    files: ['*.mjs', '*.config.mjs', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
