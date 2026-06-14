/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Prod'da backend kök URL'i (örn. https://api.kankaverse.com). Dev'de tanımsız → vite proxy. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
