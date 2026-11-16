/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Commit SHA of a CI build (set by the deploy workflow). */
  readonly VITE_BUILD_SHA?: string;
  /** UTC build date of a CI build, YYYY-MM-DD (set by the deploy workflow). */
  readonly VITE_BUILD_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
