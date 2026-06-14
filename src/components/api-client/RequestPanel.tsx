"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import Editor from "@monaco-editor/react";
import {
    store,
    addApiTab,
    closeApiTab,
    setActiveTabId,
    setActiveSubTab,
    updateActiveTabRequest,
    updateTabResponse,
    updateTabLoading,
    saveCollectionRequest,
    updateCollection,
    markActiveTabClean,
    generateId,
    addCollection,
    linkTabToRequest
} from "@/lib/store";
import { executeFrontendRequest } from "@/lib/frontend-executor";
import { parseCurl, mapParsedCurlToRequest } from "@/lib/curl";
import { getMethodColor } from "./CollectionSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { VariableInput } from "@/components/ui/VariableInput";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, X, Save, Trash2, Send, Terminal, Code, Settings, ChevronDown, ChevronRight, Folder } from "lucide-react";
import { type ApiRequest, type KeyValuePair, type ApiCollection, type ApiFolder } from "@/lib/schema";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
    cn, 
    processTemplateForFormatting, 
    addItemToCollectionTree, 
    findParentCollection, 
    parseQueryParams,
    addMonacoDecoration,
    setupMonacoJsonEditor,
    getMonacoTextAndModel,
    handleUrlPasteHelper
} from "@/lib/utils";
import { useCommonStoreState, useMonacoDecorations } from "@/lib/hooks";


const abortControllers = new Map<string, AbortController>();


const RAW_LANGUAGES = [
    { label: "Text", value: "text" },
    { label: "JavaScript", value: "javascript" },
    { label: "JSON", value: "json" },
    { label: "HTML", value: "html" },
    { label: "XML", value: "xml" }
];

// Helper to recursively find a request inside collections
const findRequestLocation = (
    collections: ApiCollection[],
    requestId: string
): { collectionId: string; folderId: string } | null => {
    for (const col of collections) {
        if (col.items.some(item => item.id === requestId && !("items" in item))) {
            return { collectionId: col.id, folderId: col.id };
        }
        
        const searchInFolders = (items: (ApiFolder | ApiRequest)[]): string | null => {
            for (const item of items) {
                if ("items" in item) {
                    if (item.items.some(child => child.id === requestId && !("items" in child))) {
                        return item.id;
                    }
                    const found = searchInFolders(item.items);
                    if (found) return found;
                }
            }
            return null;
        };

        const folderId = searchInFolders(col.items);
        if (folderId) {
            return { collectionId: col.id, folderId };
        }
    }
    return null;
};



interface FolderTreeRowProps {
    folder: { id: string; name: string; items: (ApiFolder | ApiRequest)[] };
    collectionId: string;
    selectedId: string;
    onSelect: (folderId: string, colId: string) => void;
    depth: number;
}

function FolderTreeRow({
    folder,
    collectionId,
    selectedId,
    onSelect,
    depth = 0
}: FolderTreeRowProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const subFolders = folder.items.filter(item => !("method" in item)) as ApiFolder[];
    const isSelected = selectedId === folder.id;

    return (
        <div className="space-y-1">
            <div
                onClick={() => {
                    onSelect(folder.id, collectionId);
                }}
                style={{ paddingLeft: `${depth * 12 + 6}px` }}
                className={cn(
                    "flex items-center justify-between py-1 px-2 rounded-lg text-xs cursor-pointer transition-all hover:bg-white/5",
                    isSelected ? "bg-indigo-600/20 text-white font-semibold border border-indigo-500/30" : "text-white/70"
                )}
            >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {subFolders.length > 0 ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
                            }}
                            className="text-white/40 hover:text-white p-0.5 rounded"
                        >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                    ) : (
                        <div className="w-4" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                </div>
            </div>

            {isExpanded && subFolders.length > 0 && (
                <div className="space-y-1">
                    {subFolders.map(sub => (
                        <FolderTreeRow
                            key={sub.id}
                            folder={sub}
                            collectionId={collectionId}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function RequestPanel() {
    const { collections, environments, activeEnvironmentId } = useCommonStoreState();
    
    const apiTabs = useStore(store, (state) => state.apiTabs);
    const activeTabId = useStore(store, (state) => state.activeTabId);

    const activeTab = apiTabs.find(t => t.id === activeTabId);
    const request = activeTab?.request as ApiRequest;
    const loading = activeTab?.loading;
    const requestId = activeTab?.requestId;
    const activeSubTab = activeTab?.activeSubTab || "params";

    const [isHoveringCancel, setIsHoveringCancel] = useState(false);
    const [selectedCollectionId, setSelectedCollectionId] = useState("");
    const [selectedFolderId, setSelectedFolderId] = useState("");
    const [saveAsName, setSaveAsName] = useState("");
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isSaveAsPopoverOpen, setIsSaveAsPopoverOpen] = useState(false);
    const [isExtensionActive, setIsExtensionActive] = useState(false);

    useEffect(() => {
        const checkExtension = () => {
            const active = document.documentElement.getAttribute("data-surge-extension-active") === "true";
            setIsExtensionActive(active);
        };
        checkExtension();
        const timer = setTimeout(checkExtension, 150);
        return () => clearTimeout(timer);
    }, []);

    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const decorationsRef = useRef<any[]>([]);
    const hoverProviderRef = useRef<any>(null);
    const pendingBodyUpdateRef = useRef<string | null>(null);
    const bodyUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateDecorations = React.useCallback(() => {
        const monacoInfo = getMonacoTextAndModel(editorRef.current, monacoRef.current);
        if (!monacoInfo) return;
        const { editor, model, text, monaco } = monacoInfo;
        const regex = /\{\{([^}]+)\}\}/g;
        let match;
        const newDecorations: any[] = [];
        
        const activeEnv = environments.find(e => e.id === activeEnvironmentId);
        const envKeys = activeEnv 
            ? activeEnv.variables.filter(v => v.enabled).map(v => v.key) 
            : [];
        
        const globalsEnv = environments.find(
            e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
        );
        const globalKeys = globalsEnv 
            ? globalsEnv.variables.filter(v => v.enabled).map(v => v.key) 
            : [];
        
        let colKeys: string[] = [];
        if (request?.id) {
            const parentCol = findParentCollection(collections, request.id);
            if (parentCol && parentCol.variables) {
                colKeys = parentCol.variables.filter(v => v.enabled !== false).map(v => v.key);
            }
        }
        
        const allKeys = [...envKeys, ...globalKeys, ...colKeys];

        while ((match = regex.exec(text)) !== null) {
            const varName = match[1].trim();
            const isAvailable = allKeys.includes(varName);

            addMonacoDecoration(model, monaco, match, isAvailable, newDecorations);
        }
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    }, [environments, activeEnvironmentId, collections, request?.id]);

    const debouncedUpdateDecorations = useMonacoDecorations(updateDecorations);

    const syncBodyUpdate = () => {
        if (bodyUpdateTimeoutRef.current) {
            clearTimeout(bodyUpdateTimeoutRef.current);
            bodyUpdateTimeoutRef.current = null;
        }
        if (pendingBodyUpdateRef.current !== null) {
            const raw = pendingBodyUpdateRef.current;
            pendingBodyUpdateRef.current = null;
            const activeTab = store.state.apiTabs.find(t => t.id === store.state.activeTabId);
            const currentBody = activeTab?.request?.body || { mode: "raw" };
            updateActiveTabRequest({
                body: { ...currentBody, raw, mode: "raw" }
            });
        }
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        setupMonacoJsonEditor(editor, monaco, () => {
            debouncedUpdateDecorations();
        });

        editor.onDidBlurEditorText(() => {
            syncBodyUpdate();
        });

        updateDecorations();
    };

    useEffect(() => {
        if (request) {
            setSaveAsName(request.name || "");
        }
    }, [request?.id, request?.name, request]);

    useEffect(() => {
        if (requestId) {
            const loc = findRequestLocation(collections, requestId);
            if (loc) {
                setSelectedCollectionId(loc.collectionId);
                setSelectedFolderId(loc.folderId);
            } else {
                // Request not found in collections tree anymore, reset stale IDs
                if (collections.length > 0) {
                    setSelectedCollectionId(collections[0].id);
                    setSelectedFolderId(collections[0].id);
                } else {
                    setSelectedCollectionId("");
                    setSelectedFolderId("");
                }
            }
        } else {
            if (collections.length > 0) {
                // If the selected collection is empty or points to a deleted collection, reset to the first one
                if (!selectedCollectionId || !collections.some(c => c.id === selectedCollectionId)) {
                    setSelectedCollectionId(collections[0].id);
                    setSelectedFolderId(collections[0].id);
                }
            } else {
                setSelectedCollectionId("");
                setSelectedFolderId("");
            }
        }
    }, [requestId, collections, selectedCollectionId]);

    useEffect(() => {
        updateDecorations();
    }, [updateDecorations, activeTabId]);

    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco || !request) return;
        
        const isGraphQL = request.body?.mode === "graphql";
        const currentLang = isGraphQL 
            ? "graphql" 
            : (request.body?.rawLanguage === "text" ? "plaintext" : (request.body?.rawLanguage || "json"));

        if (hoverProviderRef.current) {
            hoverProviderRef.current.dispose();
        }

        hoverProviderRef.current = monaco.languages.registerHoverProvider(currentLang, {
            provideHover: function (model: any, position: any) {
                const lineContent = model.getLineContent(position.lineNumber);
                const regex = /\{\{([^}]+)\}\}/g;
                let match;
                while ((match = regex.exec(lineContent)) !== null) {
                    const startIdx = match.index;
                    const endIdx = startIdx + match[0].length;
                    if (position.column >= startIdx + 1 && position.column <= endIdx + 1) {
                        const varName = match[1].trim();
                        
                        const activeEnv = store.state.environments.find(e => e.id === store.state.activeEnvironmentId);
                        const globalsEnv = store.state.environments.find(
                            e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
                        );
                        
                        let val: string | undefined = undefined;
                        let source: string | undefined = undefined;
                        
                        if (activeEnv) {
                            const found = activeEnv.variables.find(v => v.key === varName && v.enabled);
                            if (found) {
                                val = found.value;
                                source = `Active Env (${activeEnv.name})`;
                            }
                        }
                        if (val === undefined && globalsEnv) {
                            const found = globalsEnv.variables.find(v => v.key === varName && v.enabled);
                            if (found) {
                                val = found.value;
                                source = `Globals`;
                            }
                        }
                        if (val === undefined && request?.id) {
                            const parentCol = findParentCollection(store.state.collections, request.id);
                            if (parentCol && parentCol.variables) {
                                const found = parentCol.variables.find(v => v.key === varName && v.enabled !== false);
                                if (found) {
                                    val = found.value;
                                    source = `Collection (${parentCol.name})`;
                                }
                            }
                        }

                        if (val !== undefined) {
                            return {
                                range: new monaco.Range(position.lineNumber, startIdx + 1, position.lineNumber, endIdx + 1),
                                contents: [
                                    { value: `**Environment Variable: \`{{${varName}}}\`**` },
                                    { value: `Value: \`${val}\` (${source})` }
                                ]
                            };
                        } else {
                            return {
                                range: new monaco.Range(position.lineNumber, startIdx + 1, position.lineNumber, endIdx + 1),
                                contents: [
                                    { value: `**Environment Variable: \`{{${varName}}}\`**` },
                                    { value: `⚠ **Missing variable**. Not defined in any active or global environments.` }
                                ]
                            };
                        }
                    }
                }
                return null;
            }
        });
    }, [request?.body?.rawLanguage, request?.body?.mode, activeTabId, request]);

    useEffect(() => {
        return () => {
            syncBodyUpdate();
            if (hoverProviderRef.current) {
                hoverProviderRef.current.dispose();
            }
        };
    }, []);

    if (!activeTab) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center border border-white/5 bg-neutral-900/10 rounded-2xl p-16 text-center text-white/30">
                <Settings className="w-12 h-12 mb-3 stroke-[1.5]" />
                <p className="text-xs font-semibold mb-2">No request tab open</p>
                <Button onClick={addApiTab} className="bg-indigo-600 hover:bg-indigo-700 text-xs h-8">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    New Request Tab
                </Button>
            </div>
        );
    }

    const handleMethodChange = (method: string) => {
        updateActiveTabRequest({ method });
    };

    const handleUrlChange = (url: string) => {
        // Sync URL parameters with Params table
        const parsedParams = parseQueryParams(url);

        // Merge with existing disabled params so they don't get deleted
        const existingDisabled = (request.params || []).filter(p => p.enabled === false);
        const params = [...parsedParams, ...existingDisabled];

        updateActiveTabRequest({ url, params });
    };

    const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = e.clipboardData.getData("text");
        const intercepted = handleUrlPasteHelper(
            pastedText,
            (parsed) => {
                const mapped = mapParsedCurlToRequest(parsed);
                updateActiveTabRequest(mapped);
                toast.success("cURL command imported and parsed!");
            },
            (msg) => toast.error(msg)
        );
        if (intercepted) {
            e.preventDefault();
        }
    };

    const rebuildUrlFromParams = (baseUrl: string, params: KeyValuePair[]) => {
        const cleanBase = baseUrl.split("?")[0];
        const enabledParams = params.filter(p => p.enabled !== false && p.key);
        if (enabledParams.length > 0) {
            const qs = enabledParams
                .map(p => {
                    // Prevent URL-encoding from breaking variable placeholders
                    const key = encodeURIComponent(p.key)
                        .replace(/%7B%7B/g, "{{")
                        .replace(/%7D%7D/g, "}}");
                    const value = encodeURIComponent(p.value)
                        .replace(/%7B%7B/g, "{{")
                        .replace(/%7D%7D/g, "}}");
                    return `${key}=${value}`;
                })
                .join("&");
            return `${cleanBase}?${qs}`;
        }
        return cleanBase;
    };

    const handleParamChange = (index: number, field: keyof KeyValuePair, value: any) => {
        const params = [...(request.params || [])];
        params[index] = { ...params[index], [field]: value };
        const newUrl = rebuildUrlFromParams(request.url, params);
        updateActiveTabRequest({ params, url: newUrl });
    };

    const handleAddParam = () => {
        const params = [...(request.params || []), { key: "", value: "", enabled: true }];
        updateActiveTabRequest({ params });
    };

    const handleRemoveParam = (index: number) => {
        const params = (request.params || []).filter((_, i) => i !== index);
        const newUrl = rebuildUrlFromParams(request.url, params);
        updateActiveTabRequest({ params, url: newUrl });
    };

    const handleHeaderChange = (index: number, field: keyof KeyValuePair, value: any) => {
        const headers = [...(request.headers || [])];
        headers[index] = { ...headers[index], [field]: value };
        updateActiveTabRequest({ headers });
    };

    const handleAddHeader = () => {
        const headers = [...(request.headers || []), { key: "", value: "", enabled: true }];
        updateActiveTabRequest({ headers });
    };

    const handleRemoveHeader = (index: number) => {
        const headers = (request.headers || []).filter((_, i) => i !== index);
        updateActiveTabRequest({ headers });
    };

    const handleBodyModeChange = (mode: any) => {
        updateActiveTabRequest({
            body: { ...(request.body || { mode: "none" }), mode }
        });
    };

    const handleBodyRawChange = (raw: string) => {
        pendingBodyUpdateRef.current = raw;
        if (bodyUpdateTimeoutRef.current) {
            clearTimeout(bodyUpdateTimeoutRef.current);
        }
        bodyUpdateTimeoutRef.current = setTimeout(() => {
            syncBodyUpdate();
        }, 400);
    };

    const handleSave = () => {
        syncBodyUpdate();
        const activeTab = store.state.apiTabs.find(t => t.id === store.state.activeTabId);
        const latestRequest = activeTab?.request || request;

        const exists = requestId && collections.some(col => {
            const search = (items: any[]): boolean => {
                return items.some(item => {
                    if (item.id === requestId) return true;
                    if (item.items) return search(item.items);
                    return false;
                });
            };
            return search(col.items);
        });

        if (requestId && exists) {
            // Save updates back to original collection
            saveCollectionRequest(requestId, latestRequest);
            markActiveTabClean();
            toast.success("Request saved!");
        } else {
            setIsSaveAsPopoverOpen(true);
        }
    };

    const createFolderInTree = (
        collectionId: string,
        targetFolderId: string,
        folderName: string
    ) => {
        const col = collections.find(c => c.id === collectionId);
        if (!col) return null;

        const newFolderId = generateId();
        const newFolder: ApiFolder = {
            id: newFolderId,
            name: folderName,
            items: []
        };

        let updatedItems: (ApiFolder | ApiRequest)[];
        if (targetFolderId === collectionId) {
            updatedItems = [...col.items, newFolder];
        } else {
            const res = addItemToCollectionTree(col.items, targetFolderId, newFolder);
            if (res.success) {
                updatedItems = res.newItems;
            } else {
                updatedItems = col.items;
            }
        }

        updateCollection(collectionId, {
            items: updatedItems
        });

        toast.success(`Created folder "${folderName}"!`);
        return newFolderId;
    };

    const saveRequestToFolder = (
        collectionId: string,
        targetFolderId: string,
        requestName: string,
        latestRequest: ApiRequest
    ) => {
        let finalColId = collectionId;
        const currentCols = store.state.collections;

        const newReqId = generateId();
        const newRequest = {
            ...latestRequest,
            id: newReqId,
            name: requestName
        };

        // If target collection is stale/invalid (doesn't exist), reset finalColId to force fallback/creation
        if (finalColId && !currentCols.some(c => c.id === finalColId)) {
            finalColId = "";
        }

        if (!finalColId) {
            if (currentCols.length > 0) {
                finalColId = currentCols[0].id;
            } else {
                const newColId = generateId();
                const newlyCreatedCol = {
                    id: newColId,
                    name: "Default Collection",
                    items: [newRequest],
                    variables: []
                };
                addCollection(newlyCreatedCol);
                
                // Link this tab to the saved request
                if (activeTabId) {
                    linkTabToRequest(activeTabId, newReqId, requestName);
                }

                toast.success(`Saved request "${requestName}" in new collection "Default Collection"!`);
                return;
            }
        }

        const col = store.state.collections.find(c => c.id === finalColId) || store.state.collections[store.state.collections.length - 1];
        if (!col) {
            toast.error("Failed to save request: collection not found.");
            return;
        }

        let updatedItems: (ApiFolder | ApiRequest)[];
        const finalFolderId = targetFolderId || finalColId;
        
        if (finalFolderId === finalColId) {
            updatedItems = [...col.items, newRequest];
        } else {
            const res = addItemToCollectionTree(col.items, finalFolderId, newRequest);
            if (res.success) {
                updatedItems = res.newItems;
            } else {
                // Folder not found in tree (stale folder ID). Save to collection root as fallback
                updatedItems = [...col.items, newRequest];
                toast.info("Target folder not found. Saved request to collection root.");
            }
        }

        updateCollection(finalColId, {
            items: updatedItems
        });

        // Link this tab to the saved request
        if (activeTabId) {
            linkTabToRequest(activeTabId, newReqId, requestName);
        }

        toast.success(`Saved request "${requestName}"!`);
    };

    const handleCancel = () => {
        if (!activeTabId) return;
        const controller = abortControllers.get(activeTabId);
        if (controller) {
            controller.abort();
            abortControllers.delete(activeTabId);
        }
    };

    const handleSend = async () => {
        syncBodyUpdate();
        const activeTab = store.state.apiTabs.find(t => t.id === store.state.activeTabId);
        if (!activeTab) return;
        const request = activeTab.request;

        const targetTabId = activeTabId;
        if (!targetTabId) return;

        updateTabLoading(targetTabId, true);

        const controller = new AbortController();
        abortControllers.set(targetTabId, controller);

        const response = await executeFrontendRequest(
            request,
            requestId,
            environments,
            activeEnvironmentId,
            collections,
            controller.signal
        );

        abortControllers.delete(targetTabId);
        updateTabResponse(targetTabId, response);

        if (response.statusText === "Cancelled") {
            toast.info("Request cancelled.");
        } else if (response.status === 0) {
            toast.error("Request failed!");
        }
    };

    const renderSaveAsPopoverContent = () => {
        return (
            <div className="space-y-3.5 text-white">
                <h4 className="text-xs font-bold text-white/80">Save Request As</h4>
                
                {/* Request Name input */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">
                        Request Name
                    </label>
                    <Input
                        value={saveAsName}
                        onChange={(e) => setSaveAsName(e.target.value)}
                        placeholder="Enter request name..."
                        className="h-8 text-xs bg-neutral-950 border-white/5 text-white focus-visible:ring-indigo-500"
                    />
                </div>

                {/* Folder tree container */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">
                        Target Folder
                    </label>
                    <div className="border border-white/5 rounded-lg bg-neutral-950/60 p-2 max-h-[180px] overflow-y-auto custom-scrollbar space-y-1.5">
                        {collections.map(col => (
                            <FolderTreeRow
                                key={col.id}
                                folder={{ id: col.id, name: col.name, items: col.items }}
                                collectionId={col.id}
                                selectedId={selectedFolderId}
                                onSelect={(folderId, colId) => {
                                    setSelectedFolderId(folderId);
                                    setSelectedCollectionId(colId);
                                }}
                                depth={0}
                            />
                        ))}
                        {collections.length === 0 && (
                            <p className="text-[10px] text-white/30 italic text-center py-2">
                                No collections. Create one first.
                            </p>
                        )}
                    </div>
                </div>

                {/* Create New Folder option */}
                {selectedCollectionId && (
                    <div className="border-t border-white/5 pt-2">
                        {!isCreatingFolder ? (
                            <button
                                type="button"
                                onClick={() => setIsCreatingFolder(true)}
                                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                            >
                                <Plus className="w-3 h-3" />
                                <span>Create New Folder Here</span>
                            </button>
                        ) : (
                            <div className="flex gap-1.5 items-center">
                                <Input
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="Folder name..."
                                    className="h-7 text-xs bg-neutral-950 border-white/5 flex-grow text-white focus-visible:ring-indigo-500"
                                />
                                <Button
                                    size="xs"
                                    onClick={() => {
                                        if (!newFolderName.trim()) return;
                                        const newId = createFolderInTree(selectedCollectionId, selectedFolderId, newFolderName.trim());
                                        if (newId) {
                                            setSelectedFolderId(newId);
                                        }
                                        setNewFolderName("");
                                        setIsCreatingFolder(false);
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 h-7 px-2 font-semibold text-xs cursor-pointer"
                                >
                                    Create
                                </Button>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => setIsCreatingFolder(false)}
                                    className="h-7 w-7 text-white/40 hover:text-white p-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Save button */}
                <Button
                    disabled={!saveAsName.trim()}
                    onClick={() => {
                        saveRequestToFolder(selectedCollectionId, selectedFolderId, saveAsName.trim(), request);
                        setIsSaveAsPopoverOpen(false);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-xs h-8 font-bold cursor-pointer"
                >
                    Save Request
                </Button>
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col h-full bg-neutral-900/25 border border-white/5 rounded-2xl p-4 space-y-4 overflow-hidden">
            {/* Request tabs bar */}
            <div className="flex items-center gap-1.5 border-b border-white/5 pb-2 overflow-x-auto custom-scrollbar shrink-0">
                {apiTabs.map(t => {
                    const isActive = t.id === activeTabId;
                    return (
                        <TooltipProvider key={t.id} delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        onClick={() => setActiveTabId(t.id)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                                            isActive
                                                ? "bg-indigo-600/10 border-indigo-500/30 text-white"
                                                : "bg-neutral-950/40 border-transparent text-white/50 hover:bg-neutral-900/50"
                                        }`}
                                    >
                                        <span className={`text-[9px] font-extrabold uppercase ${getMethodColor(t.request.method)}`}>
                                            {t.request.method}
                                        </span>
                                        <span className="truncate max-w-[100px]">{t.name}</span>
                                        {t.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                closeApiTab(t.id);
                                            }}
                                            className="text-white/40 hover:text-white rounded hover:bg-white/10 p-0.5"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs max-w-[300px] break-words">
                                    <p>{t.name}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={addApiTab}
                    className="h-7 w-7 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>

            {/* Request controls */}
            <div className="space-y-3 shrink-0">
                {/* Request Name input & Extension Status */}
                <div className="flex justify-between items-center">
                    <Input
                        value={request.name}
                        onChange={(e) => updateActiveTabRequest({ name: e.target.value })}
                        className="text-sm font-bold bg-transparent border-transparent hover:border-white/5 focus:border-indigo-500/50 p-0 h-auto shadow-none focus-visible:ring-0 flex-grow"
                        placeholder="Untitled Request"
                    />
                </div>

                {/* HTTP Method + URL Input */}
                <div className="flex gap-2">
                    <select
                        value={request.method}
                        onChange={(e) => handleMethodChange(e.target.value)}
                        className="bg-neutral-950 border border-white/5 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500/50 shrink-0"
                    >
                        {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                            <option key={m} value={m} className="font-semibold">{m}</option>
                        ))}
                    </select>

                    <VariableInput
                        isBulk={false}
                        placeholder="https://api.example.com/users"
                        value={request.url}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        onPaste={handleUrlPaste}
                        className="flex-grow font-mono text-xs bg-neutral-950/60 border-white/5 focus-visible:ring-indigo-500"
                    />

                    <Button
                        onClick={loading ? handleCancel : handleSend}
                        onMouseEnter={() => setIsHoveringCancel(true)}
                        onMouseLeave={() => setIsHoveringCancel(false)}
                        className={`font-bold text-xs gap-1.5 shrink-0 px-4 rounded-xl transition-all ${
                            loading
                                ? isHoveringCancel
                                    ? "bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                                    : "bg-indigo-600/55 text-white/80 cursor-default"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                    >
                        {loading ? (
                            isHoveringCancel ? (
                                <>
                                    <span>Cancel</span>
                                    <X className="w-3.5 h-3.5" />
                                </>
                            ) : (
                                <>
                                    <span>Sending...</span>
                                    <div className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin shrink-0" />
                                </>
                            )
                        ) : (
                            <>
                                <span>Send</span>
                                <Send className="w-3.5 h-3.5" />
                            </>
                        )}
                    </Button>

                    {requestId ? (
                        <div className="inline-flex items-center bg-neutral-950/60 border border-white/5 rounded-xl hover:border-white/10 transition-all shadow-sm overflow-hidden h-9">
                            {/* Main Save Action (Left portion) */}
                            <button
                                onClick={handleSave}
                                title="Save Request"
                                className="flex items-center justify-center px-3 h-full hover:bg-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
                            >
                                <Save className="w-3.5 h-3.5" />
                            </button>

                            {/* Dropdown Arrow for Save As (Right portion) */}
                            <Popover open={isSaveAsPopoverOpen} onOpenChange={setIsSaveAsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        title="Save Options"
                                        className="flex items-center justify-center px-2 h-full hover:bg-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
                                    >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 bg-[#0b0b0c] text-white border-white/10 p-4 shadow-2xl rounded-xl" align="end">
                                    {renderSaveAsPopoverContent()}
                                </PopoverContent>
                            </Popover>
                        </div>
                    ) : (
                        /* Unsaved request: just a single Save button (Save As) that triggers the Popover, no arrow down */
                        <Popover open={isSaveAsPopoverOpen} onOpenChange={setIsSaveAsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    title="Save to Collection"
                                    className="border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 hover:text-indigo-300 shrink-0 rounded-xl h-9 px-3 cursor-pointer"
                                >
                                    <Save className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 bg-[#0b0b0c] text-white border-white/10 p-4 shadow-2xl rounded-xl" align="end">
                                {renderSaveAsPopoverContent()}
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </div>

            <Tabs
                value={activeSubTab}
                onValueChange={(val) => {
                    if (activeTabId) {
                        setActiveSubTab(activeTabId, val as any);
                    }
                }}
                className="flex-1 flex flex-col min-h-0"
            >
                <TabsList className="bg-neutral-950/60 border-b border-white/5 p-0 h-9 justify-start flex flex-nowrap overflow-x-hidden overflow-y-hidden rounded-none shrink-0 w-full">
                    <TabsTrigger
                        value="params"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Params ({(request.params || []).length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="headers"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Headers ({(request.headers || []).length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="body"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Body
                    </TabsTrigger>
                    <TabsTrigger
                        value="prerequest"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Pre-request
                    </TabsTrigger>
                    <TabsTrigger
                        value="tests"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Tests
                    </TabsTrigger>
                </TabsList>

                {/* Params Sub-Tab */}
                <TabsContent value="params" className="flex-grow overflow-y-auto custom-scrollbar mt-2 space-y-2 max-h-[350px]">
                    <div className="space-y-2">
                        {(request.params || []).map((p, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <input
                                    type="checkbox"
                                    checked={p.enabled}
                                    onChange={(e) => handleParamChange(idx, "enabled", e.target.checked)}
                                    className="rounded border-white/20 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                />
                                <VariableInput
                                    isBulk={false}
                                    placeholder="Parameter Key"
                                    value={p.key}
                                    onChange={(e) => handleParamChange(idx, "key", e.target.value)}
                                    className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                />
                                <VariableInput
                                    isBulk={false}
                                    placeholder="Value"
                                    value={p.value}
                                    onChange={(e) => handleParamChange(idx, "value", e.target.value)}
                                    className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveParam(idx)}
                                    className="h-7 w-7 text-white/40 hover:text-red-400"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddParam}
                            className="h-7 text-[10px] border-dashed border-white/10 bg-white/[0.01] hover:bg-white/5 w-full"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Parameter
                        </Button>
                    </div>
                </TabsContent>

                {/* Headers Sub-Tab */}
                <TabsContent value="headers" className="flex-grow overflow-y-auto custom-scrollbar mt-2 space-y-2 max-h-[350px]">
                    <div className="space-y-2">
                        {(request.headers || []).map((h, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <input
                                    type="checkbox"
                                    checked={h.enabled}
                                    onChange={(e) => handleHeaderChange(idx, "enabled", e.target.checked)}
                                    className="rounded border-white/20 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                />
                                <VariableInput
                                    isBulk={false}
                                    placeholder="Header Key"
                                    value={h.key}
                                    onChange={(e) => handleHeaderChange(idx, "key", e.target.value)}
                                    className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                />
                                <VariableInput
                                    isBulk={false}
                                    placeholder="Value"
                                    value={h.value}
                                    onChange={(e) => handleHeaderChange(idx, "value", e.target.value)}
                                    className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveHeader(idx)}
                                    className="h-7 w-7 text-white/40 hover:text-red-400"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddHeader}
                            className="h-7 text-[10px] border-dashed border-white/10 bg-white/[0.01] hover:bg-white/5 w-full"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Header
                        </Button>
                    </div>
                </TabsContent>

                {/* Body Sub-Tab */}
                <TabsContent value="body" className="data-[state=active]:flex flex-col flex-1 mt-2 space-y-2 min-h-0">
                    <div className="flex flex-wrap gap-4 text-xs font-semibold text-white/60 border-b border-white/5 pb-2">
                        {[
                            { label: "none", value: "none" },
                            { label: "form-data", value: "formdata" },
                            { label: "x-www-form-urlencoded", value: "urlencoded" },
                            { label: "raw", value: "raw" },
                            { label: "binary", value: "binary" },
                            { label: "GraphQL", value: "graphql" }
                        ].map((m) => (
                            <label key={m.value} className="flex items-center gap-1.5 cursor-pointer hover:text-white">
                                <input
                                    type="radio"
                                    name="bodyMode"
                                    checked={(request.body?.mode || "none") === m.value}
                                    onChange={() => handleBodyModeChange(m.value)}
                                    className="text-indigo-600 bg-neutral-900 border-white/15 cursor-pointer"
                                />
                                <span>{m.label}</span>
                            </label>
                        ))}
                    </div>

                    {(request.body?.mode || "none") === "raw" && (
                        <div className="flex flex-col flex-grow min-h-0 space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-white/60 bg-neutral-950/40 p-2 rounded-lg border border-white/5 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span>Type:</span>
                                    <select
                                        value={request.body?.rawLanguage || "json"}
                                        onChange={(e) => {
                                            updateActiveTabRequest({
                                                body: { ...request.body!, rawLanguage: e.target.value, mode: "raw" }
                                            });
                                        }}
                                        className="bg-neutral-900 border border-white/10 rounded px-2 py-0.5 text-xs text-white focus:outline-none cursor-pointer"
                                    >
                                        {RAW_LANGUAGES.map(lang => (
                                            <option key={lang.value} value={lang.value}>{lang.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {(request.body?.rawLanguage || "json") === "json" && (
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="h-6 text-[10px] text-indigo-400 hover:text-indigo-300"
                                        onClick={() => {
                                            const val = request.body?.raw || "";
                                            try {
                                                const beautified = processTemplateForFormatting(val);
                                                handleBodyRawChange(beautified);
                                            } catch {
                                                toast.error("Invalid JSON format");
                                            }
                                        }}
                                    >
                                        Beautify
                                    </Button>
                                )}
                            </div>
                            <div className="flex-1 min-h-0 w-full border border-white/5 rounded-xl overflow-hidden bg-[#1e1e1e]">
                                <Editor
                                    height="100%"
                                    language={request.body?.rawLanguage === "text" ? "plaintext" : (request.body?.rawLanguage || "json")}
                                    value={request.body?.raw || ""}
                                    onChange={(val) => handleBodyRawChange(val || "")}
                                    onMount={handleEditorDidMount}
                                    theme="vs-dark"
                                    options={{
                                        automaticLayout: true,
                                        minimap: { enabled: false },
                                        fontSize: 13,
                                        scrollBeyondLastLine: false,
                                        lineNumbers: "on",
                                        tabSize: 2,
                                        wordWrap: "on",
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {(request.body?.mode || "none") === "graphql" && (
                        <div className="flex flex-col flex-grow min-h-0 space-y-2">
                            <div className="flex-grow min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2">
                                <div className="md:col-span-8 flex flex-col min-h-0">
                                    <span className="text-[10px] font-bold uppercase text-white/40 mb-1">Query</span>
                                    <div className="flex-1 min-h-0 w-full border border-white/5 rounded-xl overflow-hidden bg-[#1e1e1e]">
                                        <Editor
                                            height="100%"
                                            language="graphql"
                                            value={request.body?.graphql?.query || ""}
                                            onChange={(val) => {
                                                updateActiveTabRequest({
                                                    body: {
                                                        ...request.body!,
                                                        mode: "graphql",
                                                        graphql: {
                                                            query: val || "",
                                                            variables: request.body?.graphql?.variables || ""
                                                        }
                                                    }
                                                });
                                            }}
                                            onMount={handleEditorDidMount}
                                            theme="vs-dark"
                                            options={{
                                                automaticLayout: true,
                                                minimap: { enabled: false },
                                                fontSize: 12,
                                                scrollBeyondLastLine: false,
                                                lineNumbers: "on",
                                                wordWrap: "on",
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-4 flex flex-col min-h-0">
                                    <span className="text-[10px] font-bold uppercase text-white/40 mb-1">Variables (JSON)</span>
                                    <textarea
                                        value={request.body?.graphql?.variables || ""}
                                        onChange={(e) => {
                                            updateActiveTabRequest({
                                                body: {
                                                    ...request.body!,
                                                    mode: "graphql",
                                                    graphql: {
                                                        query: request.body?.graphql?.query || "",
                                                        variables: e.target.value
                                                    }
                                                }
                                            });
                                        }}
                                        placeholder={'{\n  "variable": "value"\n}'}
                                        className="w-full flex-1 min-h-0 p-2.5 font-mono text-xs bg-[#121213] border border-white/5 rounded-xl text-white/80 focus:outline-none resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {(request.body?.mode || "none") === "binary" && (
                        <div className="py-2 space-y-2 flex flex-col flex-grow min-h-0">
                            <span className="text-[10px] font-bold uppercase text-white/40">Select File or Enter Raw Text Payload</span>
                            <textarea
                                value={request.body?.binary || ""}
                                onChange={(e) => {
                                    updateActiveTabRequest({
                                        body: {
                                            ...request.body!,
                                            mode: "binary",
                                            binary: e.target.value
                                        }
                                    });
                                }}
                                placeholder="Enter binary content or file payload reference..."
                                className="w-full flex-1 min-h-0 p-3 font-mono text-xs bg-[#121213] border border-white/5 rounded-xl text-white/80 focus:outline-none resize-none"
                            />
                        </div>
                    )}

                    {(request.body?.mode || "none") === "urlencoded" && (
                        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            {(request.body?.urlencoded || []).map((p, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input
                                        type="checkbox"
                                        checked={p.enabled}
                                        onChange={(e) => {
                                            const urlencoded = [...(request.body?.urlencoded || [])];
                                            urlencoded[idx] = { ...urlencoded[idx], enabled: e.target.checked };
                                            updateActiveTabRequest({ body: { ...request.body!, urlencoded } });
                                        }}
                                        className="rounded border-white/20 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                    />
                                    <VariableInput
                                        isBulk={false}
                                        placeholder="Key"
                                        value={p.key}
                                        onChange={(e) => {
                                            const urlencoded = [...(request.body?.urlencoded || [])];
                                            urlencoded[idx] = { ...urlencoded[idx], key: e.target.value };
                                            updateActiveTabRequest({ body: { ...request.body!, urlencoded } });
                                        }}
                                        className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                    />
                                    <VariableInput
                                        isBulk={false}
                                        placeholder="Value"
                                        value={p.value}
                                        onChange={(e) => {
                                            const urlencoded = [...(request.body?.urlencoded || [])];
                                            urlencoded[idx] = { ...urlencoded[idx], value: e.target.value };
                                            updateActiveTabRequest({ body: { ...request.body!, urlencoded } });
                                        }}
                                        className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const urlencoded = (request.body?.urlencoded || []).filter((_, i) => i !== idx);
                                            updateActiveTabRequest({ body: { ...request.body!, urlencoded } });
                                        }}
                                        className="h-7 w-7 text-white/40 hover:text-red-400"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const urlencoded = [...(request.body?.urlencoded || []), { key: "", value: "", enabled: true }];
                                    updateActiveTabRequest({ body: { ...request.body!, urlencoded, mode: "urlencoded" } });
                                }}
                                className="h-7 text-[10px] border-dashed border-white/10 bg-white/[0.01] hover:bg-white/5 w-full"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Add urlencoded key/value
                            </Button>
                        </div>
                    )}

                    {(request.body?.mode || "none") === "formdata" && (
                        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            {(request.body?.formdata || []).map((p, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input
                                        type="checkbox"
                                        checked={p.enabled}
                                        onChange={(e) => {
                                            const formdata = [...(request.body?.formdata || [])];
                                            formdata[idx] = { ...formdata[idx], enabled: e.target.checked };
                                            updateActiveTabRequest({ body: { ...request.body!, formdata } });
                                        }}
                                        className="rounded border-white/20 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                    />
                                    <VariableInput
                                        isBulk={false}
                                        placeholder="Key"
                                        value={p.key}
                                        onChange={(e) => {
                                            const formdata = [...(request.body?.formdata || [])];
                                            formdata[idx] = { ...formdata[idx], key: e.target.value };
                                            updateActiveTabRequest({ body: { ...request.body!, formdata } });
                                        }}
                                        className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                    />
                                    <VariableInput
                                        isBulk={false}
                                        placeholder="Value"
                                        value={p.value}
                                        onChange={(e) => {
                                            const formdata = [...(request.body?.formdata || [])];
                                            formdata[idx] = { ...formdata[idx], value: e.target.value };
                                            updateActiveTabRequest({ body: { ...request.body!, formdata } });
                                        }}
                                        className="h-8 font-mono text-[11px] bg-neutral-950/60 border-white/5"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const formdata = (request.body?.formdata || []).filter((_, i) => i !== idx);
                                            updateActiveTabRequest({ body: { ...request.body!, formdata } });
                                        }}
                                        className="h-7 w-7 text-white/40 hover:text-red-400"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const formdata = [...(request.body?.formdata || []), { key: "", value: "", enabled: true, type: "text" as const }];
                                    updateActiveTabRequest({ body: { ...request.body!, formdata, mode: "formdata" } });
                                }}
                                className="h-7 text-[10px] border-dashed border-white/10 bg-white/[0.01] hover:bg-white/5 w-full"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Add formdata key/value
                            </Button>
                        </div>
                    )}

                    {(request.body?.mode || "none") === "none" && (
                        <div className="py-8 text-center text-white/20 text-xs italic">
                            This request does not have a body payload.
                        </div>
                    )}
                </TabsContent>

                {/* Pre-request Script Sub-Tab */}
                <TabsContent value="prerequest" className="data-[state=active]:flex flex-col flex-1 mt-2 min-h-0">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1.5">
                        <Terminal className="w-3 h-3 text-indigo-400" />
                        <span>Pre-request scripts run in javascript before the HTTP call is dispatched.</span>
                    </div>
                    <div className="flex-1 min-h-0 w-full border border-white/5 rounded-xl overflow-hidden bg-[#1e1e1e]">
                        <Editor
                            height="100%"
                            language="javascript"
                            value={request.preRequestScript || ""}
                            onChange={(val) => updateActiveTabRequest({ preRequestScript: val || "" })}
                            theme="vs-dark"
                            options={{
                                automaticLayout: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false,
                                lineNumbers: "on",
                                tabSize: 2,
                                wordWrap: "on",
                            }}
                        />
                    </div>
                </TabsContent>

                {/* Tests Sub-Tab */}
                <TabsContent value="tests" className="data-[state=active]:flex flex-col flex-1 mt-2 min-h-0">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1.5">
                        <Code className="w-3 h-3 text-fuchsia-400" />
                        <span>Tests run after the request finishes. Write test cases via pm.test() blocks.</span>
                    </div>
                    <div className="flex-1 min-h-0 w-full border border-white/5 rounded-xl overflow-hidden bg-[#1e1e1e]">
                        <Editor
                            height="100%"
                            language="javascript"
                            value={request.testScript || ""}
                            onChange={(val) => updateActiveTabRequest({ testScript: val || "" })}
                            theme="vs-dark"
                            options={{
                                automaticLayout: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false,
                                lineNumbers: "on",
                                tabSize: 2,
                                wordWrap: "on",
                            }}
                        />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
