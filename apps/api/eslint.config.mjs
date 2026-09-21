import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier/flat';
export default tseslint.config(
  { ignores: ['dist/**', 'src/generated/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  prettier,
);
