/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_CAPTURE_URL?: string;
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface TurnstileApi {
  render: (
    container: string | HTMLElement,
    options: TurnstileRenderOptions,
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
}

interface Window {
  turnstile?: TurnstileApi;
  onloadTurnstileCallback?: () => void;
}
