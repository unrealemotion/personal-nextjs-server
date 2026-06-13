export const GLOBAL_TOOLS = [
    {
        type: "function",
        function: {
            name: "check_extension_connection",
            description: "Check if the Surge API Request Helper chrome extension is connected and active on the current page.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "switch_tab",
            description: "Switch the workspace tab between the Bulk Runner and the API Client.",
            parameters: {
                type: "object",
                properties: {
                    tab: {
                        type: "string",
                        description: "The tab to switch to.",
                        enum: ["bulk", "api_client"]
                    }
                },
                required: ["tab"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_console_logs",
            description: "Read the recent browser developer console logs to troubleshoot errors, warnings, and exceptions.",
            parameters: {
                type: "object",
                properties: {
                    limit: {
                        type: "integer",
                        description: "The number of recent log entries to retrieve (default: 100, maximum: 500)."
                    },
                    level: {
                        type: "string",
                        description: "Filter logs by severity/level.",
                        enum: ["all", "error", "warn", "log", "info"]
                    }
                }
            }
        }
    }
];

export const GLOBAL_TOOLS_PROMPT = `
check_extension_connection
   - Capabilities: Checks if the Surge API Request Helper Chrome extension is connected and active.
   - When to use: When requests fail with CORS errors, connection failures, or "FAILED TO FETCH" errors, or when checking connection status.
   - Tips:
     - ALWAYS format links as compact markdown hyperlinks with descriptive labels (e.g., \`[Chrome Web Store](https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf)\`). Never output raw/unformatted URLs in your text responses.
     - If the tool returns connected: true, confirm to the user that the extension is successfully connected and active.
     - If the tool returns connected: false, you MUST instruct the user to access the [Chrome Web Store](https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf) to install/enable it.
     - Share the following steps to install and enable:
       1. Access the [Chrome Web Store](https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf) extension page.
       2. Click "Add to Chrome" (or "Get" if using Microsoft Edge) to install the extension.
       3. Open extension settings (chrome://extensions/ or edge://extensions/), verify that the "Surge API Request Helper" extension is toggled to Enabled and not blocked by policies.
       4. Reload the current page tab to activate the connection.

switch_tab
   - Capabilities: Switches the active workspace tab to either Bulk Runner ("bulk") or API Client ("api_client").
   - When to use: When the user asks you to perform an action that requires tools from another tab (e.g., they ask you to inspect bulk execution but you are currently on the API Client tab).
   - Tips: After switching the tab, you can immediately continue fulfilling the user's request, as switching the tab will make the appropriate tools available.

read_console_logs
   - Capabilities: Reads the recent browser developer console logs.
   - When to use: When requests fail, when things are not working, when debugging script/sandbox errors, or when troubleshooting an issue to check for errors/exceptions.
   - Tips: Use this to check for runtime errors, script rejection warnings, or extension-related errors in the log console.
`;
