import { createI18n } from 'vue-i18n'
import tr from './tr.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'tr',
  fallbackLocale: 'tr',
  messages: { tr },
})
