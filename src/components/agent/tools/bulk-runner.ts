export const BULK_RUNNER_TOOLS = [
    {
        type: "function",
        function: {
            name: "get_row_status",
            description: "Get the status and response results of a row that has been run in the bulk runner.",
            parameters: {
                type: "object",
                properties: {
                    rowId: { type: "integer", description: "The 0-based row ID/index in the dataset." }
                },
                required: ["rowId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_data",
            description: "Search the uploaded dataset rows containing a specific query or value (returns matching indices).",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search term (case-insensitive)." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_row_data",
            description: "Read the column key-values of a specific row in the uploaded dataset.",
            parameters: {
                type: "object",
                properties: {
                    rowId: { type: "integer", description: "The 0-based row ID/index." }
                },
                required: ["rowId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "inspect_input_data",
            description: "Inspect the uploaded input dataset. Retrieve the total row count, headers, and a subset of rows (range) or specific columns. Useful for inspecting dataset structure, checking ranges of input values, or listing variables.",
            parameters: {
                type: "object",
                properties: {
                    startRow: { type: "integer", description: "The starting 0-based row index (inclusive). Default is 0." },
                    endRow: { type: "integer", description: "The ending 0-based row index (inclusive). If not provided, retrieves up to 50 rows from startRow." },
                    columns: { 
                        type: "array", 
                        items: { type: "string" }, 
                        description: "Specific column names to retrieve. If omitted or empty, retrieves all columns." 
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_execution_config",
            description: "Retrieve current bulk execution engine settings and defined API templates (methods, url, body structures, and any invalidVariables in templates).",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "simulate_row_execution",
            description: "Simulate executing the entire request chain for a row client-side in the browser. It actually calls the HTTP endpoints and returns response bodies/status codes.",
            parameters: {
                type: "object",
                properties: {
                    rowId: { type: "integer", description: "The 0-based row ID/index to simulate." }
                },
                required: ["rowId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_execution_config",
            description: "Update current bulk execution engine settings or API templates (methods, url, headers, body, params).",
            parameters: {
                type: "object",
                properties: {
                    maxRetries: { type: "integer" },
                    retryStatusCodes: { type: "string" },
                    stopOnFailure: { type: "boolean" },
                    throttleDelayMs: { type: "integer" },
                    rowIterations: { type: "integer" },
                    concurrency: { type: "integer" },
                    templateUpdates: {
                        type: "array",
                        description: "List of template updates. Must include the template 'id' to update.",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                name: { type: "string" },
                                method: { type: "string" },
                                url: { type: "string" },
                                headers: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            key: { type: "string" },
                                            value: { type: "string" },
                                            active: { type: "boolean" }
                                        }
                                    }
                                },
                                params: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            key: { type: "string" },
                                            value: { type: "string" },
                                            active: { type: "boolean" }
                                        }
                                    }
                                },
                                bodyMode: { type: "string" },
                                bodyRaw: { type: "string" }
                            },
                            required: ["id"]
                        }
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_row_data",
            description: "Update the column key-values for a specific row in the dataset.",
            parameters: {
                type: "object",
                properties: {
                    rowId: { type: "integer", description: "The 0-based row ID/index to update." },
                    updates: { 
                        type: "object", 
                        description: "Key-value pairs of the columns to update." 
                    }
                },
                required: ["rowId", "updates"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_available_variables",
            description: "Retrieve all available variables in the workspace, including uploaded Excel column headers, active and global environment variables, and references to previous step responses.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_column_mappings",
            description: "Retrieve the current list of column mappings used to structure and format the bulk runner results table.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_column_mappings",
            description: "Update or replace the entire array of column mappings. Mappings define how to extract values from variables or step results and render them as table columns.",
            parameters: {
                type: "object",
                properties: {
                    mappings: {
                        type: "array",
                        description: "The complete list of column mappings.",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string", description: "Optional unique ID. If not provided, one will be generated automatically." },
                                name: { type: "string", description: "The display name of the column." },
                                source: {
                                    type: "string",
                                    description: "The source type of the data.",
                                    enum: ["variable", "request_body", "request_param", "response", "status", "error", "response_time", "modified"]
                                },
                                path: { type: "string", description: "The JSON path or variable name (e.g. 'data.user.id' or 'my_variable'). Leave empty if not applicable." },
                                stepId: { type: "string", description: "For multi-step requests, the specific step ID to extract from. If omitted, extracts from the last step (or first step for request inputs)." },
                                visible: { type: "boolean", description: "Whether the column is visible in the results table and included in exports." }
                            },
                            required: ["name", "source", "path"]
                        }
                    }
                },
                required: ["mappings"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_table_filters",
            description: "Retrieve the current table filter, search query, sorting column, and sort direction.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_table_filters",
            description: "Update the table search query, regex search flag, column value filters, sorting column, or sort direction.",
            parameters: {
                type: "object",
                properties: {
                    searchQuery: { type: "string", description: "Global text search filter query." },
                    isRegex: { type: "boolean", description: "Whether to treat the search query as a regular expression." },
                    columnFilters: {
                        type: "object",
                        description: "Map of column ID to array of string values to match (e.g. {'col_status': ['200', '201']}). Only rows matching any of the allowed values for each filtered column are shown.",
                        additionalProperties: {
                            type: "array",
                            items: { type: "string" }
                        }
                    },
                    sortBy: { type: "string", description: "The ID of the column to sort by, or null to clear sorting." },
                    sortOrder: { type: "string", description: "Sorting direction: 'asc', 'desc', or null.", enum: ["asc", "desc", null] }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "export_results_to_excel",
            description: "Export the current dataset execution results to a downloadable Excel (.xlsx) file.",
            parameters: {
                type: "object",
                properties: {
                    onlyFiltered: { type: "boolean", description: "If true, export only the rows that match the active table filters. If false, export all executed rows." }
                },
                required: ["onlyFiltered"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_all_results",
            description: "Retrieve a summary of the bulk runner execution results for all rows (including rowId, iteration, status, statusCode, response time, and any error message). Helpful for getting an overview of all successes/failures.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "export_workspace",
            description: "Export the entire workspace (including templates, API client collections, and data) to a JSON file.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "run_bulk_engine",
            description: "Execute the bulk engine to run all configured rows. The execution happens asynchronously in the background.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    }
];

export const BULK_RUNNER_TOOLS_PROMPT = `
get_row_status
   - Capabilities: Retrieves execution status, status code, response time, error messages, and response body previews for a given row index.
   - When to use: When the user asks about the run results of a specific row (e.g., "Why did row 5 fail?" or "Did row 10 succeed?").
   - Tips: Use this to inspect the specific step results of a multi-step request chain to identify exactly where the failure occurred.

search_data
   - Capabilities: Searches for rows in the uploaded dataset that contain a specific substring query. Returns matching row IDs and previews.
   - When to use: To find specific rows containing a term like a customer ID, email, or a particular value (e.g., "Find John Doe in the dataset" or "Search for rows with code 'ERR_TOKEN'").
   - Tips: Cap query length and use unique substrings to find target rows quickly. Combine with read_row_data or simulate_row_execution on the returned rowId.

read_row_data
   - Capabilities: Reads all column key-values of a specific row in the uploaded dataset.
   - When to use: To inspect the input variables that were used (or will be used) in a row's API request. Useful for verifying if a variable value is correct, missing, or malformed.
   - Tips: Compare row data variables with template variables retrieved by get_execution_config to check for naming mismatches.

inspect_input_data
   - Capabilities: Returns the total number of rows, the available headers/columns, and a subset (range) of row values. Can also filter to only return specific columns.
   - When to use: When the user wants to check the uploaded dataset general statistics, inspect a range of rows (e.g. "show me rows 1 to 10" or "list rows 50 to 80"), or focus on a single column (e.g. "what are the values in the 'email' column?").
   - Tips: Use this to check for typos, missing values, or formats across multiple rows at once.

get_execution_config
   - Capabilities: Retrieves current execution engine settings (retries, delay, concurrency, stop-on-failure) and defined request templates, including an 'invalidVariables' array listing unresolved placeholders in each template.
   - When to use: To inspect the request templates (URL, headers, query parameters, body mode/content) or check execution rules (concurrency, delay, retries).
   - Tips: Always run this when investigating template or placeholder errors. Checking 'invalidVariables' helps pinpoint typos in variable names.

simulate_row_execution
   - Capabilities: Simulates sending actual HTTP requests client-side for a specific row in the browser, executing the entire request chain step-by-step.
   - When to use: To test or diagnose real-time API behavior. This executes the actual endpoint calls, returning real HTTP status codes, headers, and response bodies.
   - Tips: Use this to test if configuration changes (e.g., changing headers or URLs) fixed an issue before running the full bulk execution. Check if CORS issues occur.

update_execution_config
   - Capabilities: Updates execution settings (maxRetries, retryStatusCodes, stopOnFailure, throttleDelayMs, rowIterations, concurrency) or templates (name, method, url, headers, params, bodyMode, bodyRaw).
   - When to use: When the user asks to modify execution settings (e.g., "Set retries to 3", "Increase concurrency to 10") or correct request templates (e.g., "Change URL to https://api.com/v2", "Add a Bearer token header").
   - Tips: Use placeholder syntax like {{variable_name}} to map variables in-place. If updating templates, always pass the template 'id' to be updated.

update_row_data
   - Capabilities: Modifies the column key-values for a specific row in the dataset (both fileData and originalData).
   - When to use: When correcting typos or invalid values in a specific row's fields (e.g., correcting an email address or customer ID).
   - Tips: Inform the user when updates are applied so they can run or simulate that row.

get_available_variables
    - Capabilities: Retrieves all variables in the workspace (Excel/CSV headers, active environment variables, globals, and references to previous step outputs like {{Step 1.response.id}}).
    - When to use: To discover what variables can be used in template placeholders, or to debug template variables that aren't resolving.
    - Tips: Present these variables clearly to the user. Use them to fix typos in the template placeholders.

get_column_mappings
    - Capabilities: Retrieves the list of column mappings used to format and structure the results table.
    - When to use: To check what data (variable, status, error, response path, response time) is mapped to display in the result columns.

update_column_mappings
    - Capabilities: Replaces the entire column mappings list.
    - When to use: To customize columns in the results grid (e.g., "Add a column for response time", "Show the user ID from Step 2's response").
    - Tips: Valid sources are "variable", "request_body", "request_param", "response", "status", "error", "response_time", "modified".

get_table_filters
    - Capabilities: Retrieves search query, regex flag, column filters, and sort order.
    - When to use: To inspect the current active constraints on the results table view.

update_table_filters
    - Capabilities: Updates table search, regex matching, column value filters, and sorting.
    - When to use: To filter or sort the UI grid (e.g., "Filter by status 401", "Sort rows by response time descending", "Search for 'success'").
    - Tips: This affects the visual table and what rows are exported if exporting 'onlyFiltered'.

export_results_to_excel
    - Capabilities: Triggers a download of the execution results as an Excel (.xlsx) file.
    - When to use: When the user requests to "download results", "export to Excel", or "save the table".
    - Tips: Specify onlyFiltered: true to export only active filtered rows, or false to export the entire table.

get_all_results
    - Capabilities: Retrieves a summary of execution results for all executed rows (rowId, iteration, status, statusCode, responseTimeMs, error).
    - When to use: To compile statistics, summarize overall runs (e.g., "50 out of 60 rows succeeded"), or identify all failed row IDs.

export_workspace
    - Capabilities: Triggers a download of the entire workspace state (templates, configurations, collections, data) as a JSON file.
    - When to use: When the user asks to "export the workspace", "backup my data", or "save the session".

run_bulk_engine
    - Capabilities: Starts the bulk execution engine to run all configured rows based on current templates and concurrency settings.
    - When to use: When the user asks to "run the engine", "execute all rows", or "start the bulk run".
    - Tips: Inform the user that the engine has started executing in the background and they can monitor progress on the execution panel.

---
Troubleshooting & Workflows:
- If a row execution fails or behaves unexpectedly:
  1. Retrieve execution template details via get_execution_config.
  2. Check for unresolved/invalid variables in the templates.
  3. Fetch the row's input variables via read_row_data.
  4. Perform client-side test execution via simulate_row_execution to inspect real HTTP responses/errors.
  5. Provide clear, precise reasoning of the failure (e.g., expired auth token, incorrect JSON path, naming mismatch) and offer to apply the fix using update_execution_config or update_row_data.
`;
