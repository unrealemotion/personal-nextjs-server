# Surge API Helper Extension

A minimal Chrome Extension to inject custom `Cookie`/`Host` headers and completely bypass CORS in the Surge API client interface.

## How to Install

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `extension` folder in this repository (`next.unrealemo.space/extension`).

## How it Works

1. **Content Script (`content.js`)**: Runs on the Surge client pages. It sets a flag on the DOM (`data-surge-extension-active="true"`) to indicate the extension is active. It also listens to events from the page and passes them to the background.
2. **Background Script (`background.js`)**: Registers temporary declarative network session rules.
   - When a request is sent, it adds custom headers (like `Cookie`, `Host`, etc.) to the outgoing request.
   - It strips target origin CORS restrictions and appends permissive CORS response headers, allowing the browser to read the API responses directly.
3. **Clean-up**: Once the fetch call finishes (whether successfully, on error, or aborted), the rules are instantly cleared to prevent side-effects on other tabs.
