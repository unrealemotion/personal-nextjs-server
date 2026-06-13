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
            name: "save_requests",
            description: "Create, update, or save one or more API requests in the workspace collections (supports batch operations).",
            parameters: {
                type: "object",
                properties: {
                    requests: {
                        type: "array",
                        description: "The list of request persistence operations to perform.",
                        items: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    enum: ["create", "update", "save_tab", "close_tab"],
                                    description: "The persistence action to perform."
                                },
                                requestId: { type: "string", description: "Used with action='update'. The ID of the collection request to update." },
                                tabId: { type: "string", description: "Used with action='save_tab' or action='close_tab'. The ID of the open tab to save/close." },
                                collectionId: { type: "string", description: "Optional. The collection ID to add/save the request to." },
                                folderId: { type: "string", description: "Optional. The folder ID inside the collection to add/save the request to." },
                                name: { type: "string", description: "The name of the request." },
                                method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "QUERY"], description: "The HTTP method of the request." },
                                url: { type: "string", description: "The URL of the request." },
                                headers: {
                                    type: "array",
                                    description: "Used with action='update'. Headers array.",
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
                                    description: "Used with action='update'. Params array.",
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
                                bodyMode: { type: "string", enum: ["none", "raw", "formdata", "urlencoded", "binary", "graphql"], description: "Used with action='update'. Request body mode." },
                                bodyRaw: { type: "string", description: "Used with action='update'. Raw text request body." },
                                newCollectionName: { type: "string", description: "Used with action='save_tab'. If provided, creates a brand new collection with this name and saves the request into it." },
                                preRequestScript: { type: "string", description: "Used with action='update' or action='create'. JavaScript code to run before sending this request." },
                                testScript: { type: "string", description: "Used with action='update' or action='create'. JavaScript code to run after receiving the response." },
                                activeSubTab: { type: "string", enum: ["params", "headers", "body", "prerequest", "tests"], description: "Optional. Switch the request detail panel sub-tab (params, headers, body, prerequest, tests) after modifying/saving." },
                                activateTab: { type: "boolean", description: "Optional. If true, switch focus/active tab to this request tab so it is displayed to the user." }
                            },
                            required: ["action"]
                        }
                    }
                },
                required: ["requests"]
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
            name: "send_request",
            description: "Send/execute a request in the API Client. This performs the network request, runs pre-request and test scripts, and updates the tab's response state.",
            parameters: {
                type: "object",
                properties: {
                    tabId: { type: "string", description: "Optional. The ID of the tab to send. If not specified, sends the currently active tab." }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "select_active_item",
            description: "Activate or switch to a workspace item, such as an environment profile, an open tab, or a saved collection request.",
            parameters: {
                type: "object",
                properties: {
                    environmentId: { type: "string", description: "Optional. The ID of the environment profile to activate. Use 'null' (as a string) or null value to deselect the active environment." },
                    tabId: { type: "string", description: "Optional. The ID of the open tab to switch focus to." },
                    requestId: { type: "string", description: "Optional. The ID of the saved request from collections to open in a tab and activate." },
                    activeSubTab: { type: "string", enum: ["params", "headers", "body", "prerequest", "tests"], description: "Optional. Switch the active request's sub-tab to display specific configurations (params, headers, body, prerequest, or tests)." }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "modify_collections",
            description: "Create, rename, delete collections/folders, delete requests, or move requests/folders around within collections (supports batch operations).",
            parameters: {
                type: "object",
                properties: {
                    operations: {
                        type: "array",
                        description: "The list of collection/folder structure modification operations to perform.",
                        items: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    enum: ["create_collection", "delete_collection", "update_collection", "create_folder", "update_folder", "delete_folder", "delete_request", "move_item"],
                                    description: "The action to perform on collections."
                                },
                                collectionId: { type: "string", description: "The ID of the collection (required for create_collection, delete_collection, update_collection, and create_folder if adding at collection root)." },
                                collectionName: { type: "string", description: "The name of the collection (used when creating or renaming)." },
                                folderId: { type: "string", description: "The ID of the folder (required for delete_folder, update_folder, or create_folder to add inside another folder)." },
                                folderName: { type: "string", description: "The name of the folder (used when creating or renaming)." },
                                requestId: { type: "string", description: "The ID of the request to delete (used with delete_request)." },
                                itemId: { type: "string", description: "The ID of the request or folder to move (used with move_item)." },
                                targetParentId: { type: "string", description: "The ID of the target collection or folder to move the item into (used with move_item)." }
                            },
                            required: ["action"]
                        }
                    }
                },
                required: ["operations"]
            }
        }
    }
];

export const API_CLIENT_TOOLS_PROMPT = `
get_collections
   - Capabilities: Retrieves the tree structure of all API collections, folders, and requests.
   - When to use: When you need to find a specific request ID or inspect how the user's APIs are organized.

save_requests
   - Capabilities: Create new request(s), update properties of existing request(s) (including headers, body, pre-request scripts, and test scripts), save open tab(s) to collections, close open request tab(s), or switch the active request sub-tab (params, headers, body, prerequest, tests). Supports performing multiple request actions at once (batch mode).
   - When to use: When the user asks to "create a request", "update request url/headers/body/scripts", "save this open tab", or "close this tab".
   - Tips: Provide a list of actions in the 'requests' array. Each item must specify 'action' ('create', 'update', 'save_tab', or 'close_tab'). Pass 'requestId' for updates, and 'tabId' for saving/closing open tabs. You can optionally pass 'activeSubTab' to switch the request view, and 'activateTab' (boolean) to switch/focus focus to that request tab.

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

send_request
   - Capabilities: Sends/executes an API request in the active or specified tab, executing any pre-request and test scripts, and updating the tab's response.
   - When to use: When the user asks you to "send this request", "execute the active request", "run the request in the open tab", or "test this endpoint".
   - Tips: You can omit 'tabId' to send the currently active tab.

select_active_item
   - Capabilities: Activates/selects an environment profile, switches focus to another open tab, opens a saved request from the collection, or switches the active sub-tab of the request (params, headers, body, prerequest, tests).
   - When to use: When the user asks you to "switch to staging environment", "open the GET User request", "show the login request", "switch tab", "select production variables", or "show request headers".
   - Tips: Provide only the ID(s)/sub-tab you want to change. You can pass 'environmentId' to change environment, 'tabId' to switch tabs, 'requestId' to open a collection request, and 'activeSubTab' to change detail view tab. To deselect the active environment, pass environmentId as null or 'null'.

modify_collections
   - Capabilities: Creates, renames, deletes collections or folders, deletes requests, and moves requests/folders between directories. Supports multiple batch operations in one call.
   - When to use: When the user asks to "create collection", "delete folder", "rename folder xyz", "delete request abc from collection", or "move request into folder v2".
   - Tips: Provide an array of 'operations'. Each operation specifies an 'action' (e.g. 'create_folder', 'move_item', etc.) and relevant identifier parameters.
`;
