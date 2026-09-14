/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_MOCK_MODE?: string;
  readonly VITE_DESIGN_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
