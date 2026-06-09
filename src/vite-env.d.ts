/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMAGE_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_LLM_API_KEY?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_RFT_GLOBAL?: string;
  readonly RFT_GLOBAL?: string;
  readonly VITE_RFT_DEFAULT?: string;
  readonly RFT_DEFAULT?: string;
  readonly RFT_LOCAL_TEST_API_KEY?: string;
  readonly VITE_RFT_LOCAL_TEST_API_KEY?: string;
  readonly RFT_LOCAL_DEFAULT?: string;
  readonly VITE_RFT_LOCAL_DEFAULT?: string;
  readonly [key: `VITE_OPENAI_API_KEY_${string}`]: string | undefined;
  readonly [key: `VITE_LLM_API_KEY_${string}`]: string | undefined;
  readonly [key: `VITE_API_KEY_${string}`]: string | undefined;
  readonly [key: `VITE_IMAGE_API_KEY_${string}`]: string | undefined;
  readonly [key: `VITE_RFT_${string}`]: string | undefined;
  readonly [key: `RFT_${string}`]: string | undefined;
  readonly [key: `RFT_LOCAL_${string}`]: string | undefined;
  readonly [key: `VITE_RFT_LOCAL_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
