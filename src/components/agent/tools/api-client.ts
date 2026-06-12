export const API_CLIENT_TOOLS = [
    {
        type: "function",
        function: {
            name: "get_collections",
            description: "Retrieve all API collections, folders, and requests.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "create_request",
            description: "Create a new API request and add it to a collection.",
            parameters: {
                type: "object",
                properties: {
                    collectionId: { type: "string", description: "The ID of the collection to add the request to. If null, it will be added to the first available collection." },
                    folderId: { type: "string", description: "Optional folder ID within the collection." },
                    name: { type: "string", description: "The name of the new request." },
                    method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "QUERY"] },
                    url: { type: "string", description: "The URL of the request." }
                },
                required: ["name", "method", "url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_request",
            description: "Update an existing API request within a collection.",
            parameters: {
                type: "object",
                properties: {
                    requestId: { type: "string", description: "The ID of the request to update." },
                    name: { type: "string" },
                    method: { type: "string" },
                    url: { type: "string" },
                    headers: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" },
                                enabled: { type: "boolean" },
                                description: { type: "string" }
                            }
                        }
                    },
                    params: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" },
                                enabled: { type: "boolean" },
                                description: { type: "string" }
                            }
                        }
                    },
                    bodyMode: { type: "string", enum: ["none", "raw", "formdata", "urlencoded", "binary", "graphql"] },
                    bodyRaw: { type: "string" }
                },
                required: ["requestId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_environments",
            description: "Retrieve all environment profiles and their variables, including identifying the currently active environment.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "create_environment",
            description: "Create a new environment profile.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "The name of the new environment." }
                },
                required: ["name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_environment",
            description: "Update an existing environment, including adding, removing, or modifying its variables.",
            parameters: {
                type: "object",
                properties: {
                    environmentId: { type: "string", description: "The ID of the environment to update." },
                    name: { type: "string", description: "New name for the environment (optional)." },
                    variables: {
                        type: "array",
                        description: "The complete list of variables for this environment. This will replace the existing variables entirely.",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" },
                                enabled: { type: "boolean" },
                                type: { type: "string", enum: ["default", "secret"] }
                            },
                            required: ["key", "value", "enabled"]
                        }
                    }
                },
                required: ["environmentId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_open_tabs",
            description: "Retrieve the list of currently open tabs in the API Client workspace. Useful for finding the requestId of the request the user is currently looking at.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "save_tab_request",
            description: "Saves a tab's request to the collection. If it's already saved (has a requestId), it updates the existing request. If it's a new request, it will automatically save to the first collection (or create one) unless collectionId is specified.",
            parameters: {
                type: "object",
                properties: {
                    tabId: { type: "string", description: "The ID of the tab to save." },
                    collectionId: { type: "string", description: "Optional collection ID to save into if it's a new request." },
                    folderId: { type: "string", description: "Optional folder ID to save into if it's a new request." },
                    name: { type: "string", description: "Optional name to save the request as." },
                    newCollectionName: { type: "string", description: "If provided, creates a brand new collection with this name and saves the request into it." }
                },
                required: ["tabId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "send_request",
            description: "Send/execute a request in the API Client. This performs the network request, runs pre-request and test scripts, and updates the tab's response state.",
            parameters: {
                type: "object",
                properties: {
                    tabId: { type: "string", description: "Optional. The ID of the tab to send. If not specified, sends the currently active tab." }
                }
            }
        }
    }
];

export const API_CLIENT_TOOLS_PROMPT = `
get_collections
   - Capabilities: Retrieves the tree structure of all API collections, folders, and requests.
   - When to use: When you need to find a specific request ID or inspect how the user's APIs are organized.

create_request
   - Capabilities: Creates a new API request, saves it to a collection, and opens it in a new tab for the user.
   - When to use: When the user asks you to "create a new request" or "add a POST request".
   - Tips: Provide a 'collectionId' if the user specifies which collection to use; otherwise, it will default to the first collection.

update_request
   - Capabilities: Modifies the URL, method, headers, params, or body of an existing API request.
   - When to use: When the user asks you to edit an existing request.
   - Tips: You must first use get_collections to find the 'requestId'.

get_environments
   - Capabilities: Retrieves all environment profiles, their variables, and indicates the active environment.
   - When to use: When the user asks to "list my variables" or "what is the base URL".

create_environment
   - Capabilities: Creates an empty new environment profile.
   - When to use: When the user asks to create an environment.

update_environment
   - Capabilities: Replaces the variables list for a specific environment and optionally renames it.
   - When to use: When the user asks to "add a token to my environment" or "change the base_url variable".
   - Tips: First use get_environments to retrieve the existing 'variables' array. Modify that array in your code, and pass the entirely updated array to this tool, as it overwrites the list.

get_open_tabs
   - Capabilities: Retrieves all currently open request tabs in the API Client workspace, including their ID, name, method, URL, and whether they have unsaved changes.
   - When to use: When the user refers to "this request" or an unsaved/recently created request that is currently open in a tab, and you need its 'requestId' to update it.

save_tab_request
   - Capabilities: Saves the current dirty state of a tab directly to the collection database, clearing the unsaved changes indicator.
   - When to use: When the user asks to "save this request" or "save my open tab".
   - Tips: First use get_open_tabs to find the 'tabId'. If the user wants to save it to a new collection, provide 'newCollectionName'.

send_request
   - Capabilities: Sends/executes an API request in the active or specified tab, executing any pre-request and test scripts, and updating the tab's response.
   - When to use: When the user asks you to "send this request", "execute the active request", "run the request in the open tab", or "test this endpoint".
   - Tips: You can omit 'tabId' to send the currently active tab.
`;
