// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...pluginVue.configs['flat/recommended'],
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  // .vue dosyalarında <script> bloğu TS parser'a devredilir (vue-eslint-parser sarmalıyor).
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/multi-word-component-names': 'off',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  // 🔴 D42 KUSURU VE DÜZELTMESİ (2026-08-07) — `.vue` dosyalarında prettier KAPALI.
  // Sebep: `semi: false` (kod tabanının gerçek stili) prettier'ın Vue şablon ifadelerini
  // bozmasına yol açıyor. `@click="a = false; b = true"` gibi ÇOK İFADELİ inline handler'larda
  // prettier noktalı virgülü kaldırıp ifadeleri alt alta yazıyor; Vue şablon derleyicisi bunu
  // ayrıştıramıyor ve uygulama AÇILMIYOR ("Unexpected token, expected ,"). İlk turda 12 dosya
  // böyle kırıldı ve sahip tarayıcıda buldu.
  //
  // Neden bu çözüm: `semi: true`ya dönmek 12.600 satıra noktalı virgül ekleyip yerleşik stille
  // kavga ederdi; kırılan dosyaları elle onarmak ise tuzağı bırakırdı (bir sonraki `--fix` yine
  // bozardı). `.ts`/`.js` tarafında `semi: false` sorunsuz — sorun YALNIZ şablon ifadelerinde.
  // ESLint'in Vue kuralları (`flat/recommended`) ve tip kuralları `.vue` dosyalarında AÇIK kalır;
  // kapanan yalnız biçimlendirme.
  {
    files: ['**/*.vue'],
    rules: {
      'prettier/prettier': 'off',
    },
  },
);
