export const SURGE_DOCUMENTATION = `
# Surge API Workspace & Bulk Runner Documentation

Surge is a browser-based bulk API orchestrator. You upload a spreadsheet of data, design one or many API request templates, and Surge executes them row by row, in parallel or sequentially.

## 1. CORS Restrictions & Chrome Extension Helper
- **Browser-Initiated Fetch:** Surge executes requests directly inside your browser engine. If target servers do not have permissive CORS headers, requests will fail with \`FAILED TO FETCH\` or \`CORS POLICY\` errors.
- **Surge API Request Helper Extension:** An extension that automatically registers dynamic netRequest rules to bypass CORS blockages and inject custom User-Agent and Cookie headers.
- **Connection Check Instructions:**
  - Locate the connection badge in the top header.
  - If showing inactive/not connected: Go to the Chrome Web Store and install the **Surge API Request Helper** extension.
  - If already installed, open browser extensions settings (e.g., \`chrome://extensions/\`), verify that the extension is toggled to **"Enabled"** and **not blocked** (check if group policy/settings customize allowed or blocking extensions).
  - Reload the page tab to activate the extension connection.

## 2. API Client Workspace
Surge includes a fully-featured API Client workspace (similar to Postman) alongside the Bulk Runner.
- **Collections & Folders:** Group requests into hierarchies.
- **Environments & Variables:** Define active or global variables (e.g., \`{{token}}\`) that resolve dynamically in URLs, headers, parameters, and request bodies.
- **Pre-request Scripts:** Write JavaScript to run before sending requests, modifying variables or dynamically appending headers.
- **Test Scripts:** Write assertions using \`pm.test()\` blocks executing after response delivery.
- **GraphQL & Binary Payloads:** Supports GraphQL queries/variables and raw binary payloads.

## 3. Bulk Runner Workflow
### Step 1: Upload Data Source
- Supported file types: \`.csv\`, \`.xlsx\`, \`.xls\`.
- Each column header parsed acts as a variable (\`{{column_name}}\`).
- You can configure the column's data type (string, number, boolean) to control formatting in request bodies.

### Step 2: Design Request Templates
- Placeholders: Use \`{{column_name}}\` in URL, Headers, Query Parameters, or Request Body.
- JSON Serialization: If column type is number or boolean, values are injected without quotes so that final output remains valid JSON.
- cURL Support: Paste clean cURL commands in the URL field to auto-populate method, URL, headers, and body.

### Step 3: Chain Multiple Steps
- Multiple API request templates can run sequentially for each row (e.g., Step 1: \`POST /create\`, Step 2: \`GET /verify\`).
- **Step Output Propagation:** Reference previous step properties using dot-notation:
  - \`{{Step 1.response.id}}\`
  - \`{{Create User.response.data.profile.role}}\`
  - \`{{Step 1.statusCode}}\`

### Step 4: Execution Engine Configurations
- **Concurrency Limit:** Parallel workers count (1 to 50).
- **Max Retry Count:** Retry attempts (0 to 10) on transient HTTP errors.
- **Retry Status Ranges:** Comma-separated status codes/ranges (e.g., \`408, 429, 500-599\`).
- **Throttling Delay (ms):** Cooldown time between row execution starts to prevent rate limits.
- **Row Iterations:** Process each row multiple times.
- **Stop on Failure:** Skip subsequent steps for a row if any prior step fails.

### Step 5: Column Mapping & Results Export
- Map output variables into custom headers for export:
  - **Source types:** Variable, Request Body, Request Param, Response, Status, Error.
  - **Path:** Dot-notation path (e.g., \`data.customer.id\`).
- Export finished dataset results back to Excel (\`.xlsx\`).
`;
