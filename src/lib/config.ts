export const MIN_REQUIRED_EXTENSION_VERSION = "1.0.5";
export const EXTENSION_CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf";
export const EXTENSION_CHROME_WEB_STORE_FULL_URL = `${EXTENSION_CHROME_WEB_STORE_URL}?hl=en-US&utm_source=ext_sidebar`;

export const EXTENSION_SETUP_RULES_TIMEOUT_MS = 10000;
export const EXTENSION_CLEAR_RULES_TIMEOUT_MS = 5000;
export const EXTENSION_PROBE_VERSION_TIMEOUT_MS = 150;
export const EXTENSION_PROBE_FALLBACK_TIMEOUT_MS = 500;

export const LOCAL_STORAGE_KEY = "surge_api_workspace";

export const DEFAULT_AGENT_CONFIGS = {
    gemini: {
        id: "default-gemini",
        name: "Gemini 2.5 Flash",
        provider: "gemini" as const,
        apiKey: "",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
        model: "gemini-2.5-flash"
    },
    openai: {
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini"
    },
    custom: {
        endpoint: "http://localhost:11434/v1",
        model: "llama3"
    }
};

export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_MAX_RETRIES = 0;
export const DEFAULT_THROTTLE_DELAY_MS = 0;
export const DEFAULT_ROW_ITERATIONS = 1;
export const DEFAULT_STOP_ON_FAILURE = false;
