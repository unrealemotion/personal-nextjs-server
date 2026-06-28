"use client";

import React, { useState, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { useCommonStoreState, useFileImporter } from "@/lib/hooks";
import {
    store,
    addCollection,
    deleteCollection,
    updateCollection,
    openRequestInTab,
    setActiveEnvironmentId,
    createDefaultApiRequest,
    generateId
} from "@/lib/store";
import { importPostmanCollection } from "@/lib/postman";
import { addItemToCollectionTree } from "@/lib/utils";
import { readFileAsText } from "@/lib/file-utils";
import { Button } from "@/components/ui/button";
import { EnvironmentModal } from "./EnvironmentModal";
import {
    Folder,
    FileText,
    ChevronDown,
    ChevronRight,
    Plus,
    Trash2,
    Upload,
    FolderPlus,
    FilePlus
} from "lucide-react";
import { type ApiCollection, type ApiFolder, type ApiRequest } from "@/lib/schema";
import { toast } from "@/components/ui/toast-provider";

export function getMethodColor(method: string): string {
    const m = (method || "GET").toUpperCase();
    if (m === "GET") return "text-emerald-400";
    if (m === "POST") return "text-amber-500";
    if (m === "PUT") return "text-sky-400";
    if (m === "PATCH") return "text-violet-400";
    if (m === "DELETE") return "text-rose-500";
    return "text-neutral-400";
}

// Tree node component (handles Folders & Requests recursively)
function CollectionNode({
    item,
    depth = 0,
    onRemoveItem,
    onAddItem
}: {
    item: ApiFolder | ApiRequest;
    depth: number;
    onRemoveItem: (id: string) => void;
    onAddItem: (folderId: string, type: "request" | "folder") => void;
}) {
    const [isOpen, setIsOpen] = useState(true);
    const isFolder = !("method" in item);

    if (isFolder) {
        const folder = item as ApiFolder;
        return (
            <div className="space-y-0.5">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    style={{ paddingLeft: `${depth * 12 + 6}px` }}
                    className="flex items-center justify-between py-1.5 pr-2 rounded-lg text-xs font-medium hover:bg-white/[0.03] text-white/70 hover:text-white cursor-pointer group"
                >
                    <div className="flex items-center gap-1.5 min-w-max">
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="whitespace-nowrap">{folder.name}</span>
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddItem(folder.id, "request");
                            }}
                            title="Add Request"
                            className="h-5 w-5 text-white/40 hover:text-white"
                        >
                            <FilePlus className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddItem(folder.id, "folder");
                            }}
                            title="Add Folder"
                            className="h-5 w-5 text-white/40 hover:text-white"
                        >
                            <FolderPlus className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveItem(folder.id);
                            }}
                            className="h-5 w-5 hover:bg-red-950/20 text-white/40 hover:text-red-400"
                        >
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    </div>
                </div>

                {isOpen && (
                    <div className="space-y-0.5">
                        {folder.items.map((child) => (
                            <CollectionNode
                                key={child.id}
                                item={child}
                                depth={depth + 1}
                                onRemoveItem={onRemoveItem}
                                onAddItem={onAddItem}
                            />
                        ))}
                        {folder.items.length === 0 && (
                            <p 
                                style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                                className="text-[10px] text-white/30 py-1"
                            >
                                Empty folder
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // It's a Request
    const req = item as ApiRequest;
    return (
        <div
            onClick={() => openRequestInTab(req, req.id)}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
            className="flex items-center justify-between py-1.5 pr-2 rounded-lg text-xs hover:bg-white/[0.04] text-white/60 hover:text-white cursor-pointer group"
        >
            <div className="flex items-center gap-2 min-w-max">
                <span className={`text-[9px] font-extrabold w-8 uppercase shrink-0 ${getMethodColor(req.method)}`}>
                    {req.method}
                </span>
                <span className="whitespace-nowrap">{req.name}</span>
            </div>
            <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemoveItem(req.id);
                }}
                className="h-5 w-5 opacity-0 group-hover:opacity-100 hover:bg-red-950/20 text-white/40 hover:text-red-400"
            >
                <Trash2 className="w-3 h-3" />
            </Button>
        </div>
    );
}

export function CollectionSidebar() {
    const { collections, environments, activeEnvironmentId } = useCommonStoreState();
    
    const { fileInputRef, handleImportClick, handleFileChange } = useFileImporter(
        (content) => {
            try {
                const collection = importPostmanCollection(content);
                addCollection(collection);
                toast.success(`Imported collection "${collection.name}"!`);
            } catch {
                toast.error("Failed to parse Postman collection. Check file format.");
            }
        },
        () => {
            toast.error("Failed to read Postman collection file.");
        }
    );

    const handleAddCollection = () => {
        const name = prompt("Collection Name:");
        if (!name) return;
        const newCol: ApiCollection = {
            id: generateId(),
            name,
            items: [],
            variables: []
        };
        addCollection(newCol);
    };

    const handleRemoveItemFromCollection = (collectionId: string, itemId: string) => {
        const col = collections.find(c => c.id === collectionId);
        if (!col) return;

        const filterOut = (items: (ApiFolder | ApiRequest)[]): (ApiFolder | ApiRequest)[] => {
            return items
                .filter(item => item.id !== itemId)
                .map(item => {
                    if ("items" in item) {
                        return {
                            ...item,
                            items: filterOut(item.items)
                        };
                    }
                    return item;
                });
        };

        updateCollection(collectionId, {
            items: filterOut(col.items)
        });
    };

    const getCollectionAndName = (collectionId: string, type: "request" | "folder") => {
        const col = collections.find(c => c.id === collectionId);
        if (!col) return null;
        const name = prompt(type === "request" ? "Request Name:" : "Folder Name:");
        if (!name) return null;
        return { col, name };
    };

    const handleAddItemToCollection = (collectionId: string, type: "request" | "folder") => {
        const res = getCollectionAndName(collectionId, type);
        if (!res) return;
        const { col, name } = res;

        if (type === "request") {
            const newReq = createDefaultApiRequest(name);
            updateCollection(collectionId, {
                items: [...col.items, newReq]
            });
            openRequestInTab(newReq, newReq.id);
        } else {
            const newFolder: ApiFolder = {
                id: generateId(),
                name,
                items: []
            };
            updateCollection(collectionId, {
                items: [...col.items, newFolder]
            });
        }
    };

    const handleAddItemToFolder = (collectionId: string, folderId: string, type: "request" | "folder") => {
        const res = getCollectionAndName(collectionId, type);
        if (!res) return;
        const { col, name } = res;

        const newItem = type === "request"
            ? createDefaultApiRequest(name)
            : { id: generateId(), name, items: [] as (ApiFolder | ApiRequest)[] };

        let updatedItems: (ApiFolder | ApiRequest)[];
        if (folderId === collectionId) {
            updatedItems = [...col.items, newItem];
        } else {
            const res = addItemToCollectionTree(col.items, folderId, newItem);
            if (res.success) {
                updatedItems = res.newItems;
            } else {
                updatedItems = col.items;
            }
        }

        updateCollection(collectionId, {
            items: updatedItems
        });

        if (type === "request") {
            openRequestInTab(newItem as ApiRequest, newItem.id);
        }
    };

    return (
        <div className="w-full flex flex-col h-full bg-neutral-900/25 border border-white/5 rounded-2xl p-4 overflow-hidden">
            {/* Input for postman JSON imports */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
            />

            {/* Quick Environment Selector */}
            <div className="mb-4 pb-4 border-b border-white/5 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider block mb-1">
                        Active Environment
                    </label>
                    <select
                        value={activeEnvironmentId || ""}
                        onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
                        className="w-full bg-neutral-950/60 border border-white/5 rounded-lg text-xs py-1 px-2 font-medium text-white focus:outline-none focus:border-indigo-500/50"
                    >
                        <option value="">No Environment</option>
                        {environments.map(env => (
                            <option key={env.id} value={env.id}>{env.name}</option>
                        ))}
                    </select>
                </div>
                <div className="pt-4 shrink-0">
                    <EnvironmentModal />
                </div>
            </div>

            {/* Collections Toolbar */}
            <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest">Collections</h3>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleImportClick}
                        title="Import Postman Collection"
                        className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/5"
                    >
                        <Upload className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleAddCollection}
                        title="New Collection"
                        className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/5"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Collection Tree list */}
            <div className="flex-grow overflow-auto custom-scrollbar space-y-3 pr-1">
                {collections.map((col) => (
                    <div key={col.id} className="border border-white/[0.03] bg-white/[0.01] rounded-xl p-2 space-y-1">
                        {/* Collection Header */}
                        <div className="flex items-center justify-between px-1 py-1 rounded hover:bg-white/5 cursor-pointer group">
                            <div className="flex items-center gap-1.5 min-w-max">
                                <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="text-xs font-bold text-white/80 group-hover:text-white whitespace-nowrap">
                                    {col.name}
                                </span>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleAddItemToCollection(col.id, "request")}
                                    title="Add Request"
                                    className="h-5 w-5 text-white/40 hover:text-white"
                                >
                                    <FilePlus className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleAddItemToCollection(col.id, "folder")}
                                    title="Add Folder"
                                    className="h-5 w-5 text-white/40 hover:text-white"
                                >
                                    <FolderPlus className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteCollection(col.id)}
                                    title="Delete Collection"
                                    className="h-5 w-5 text-white/40 hover:text-red-400"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>

                        {/* Collection Items */}
                        <div className="space-y-0.5 pl-1.5 pt-1">
                            {col.items.map((item) => (
                                <CollectionNode
                                    key={item.id}
                                    item={item}
                                    depth={0}
                                    onRemoveItem={(itemId) => handleRemoveItemFromCollection(col.id, itemId)}
                                    onAddItem={(folderId, type) => handleAddItemToFolder(col.id, folderId, type)}
                                />
                            ))}
                            {col.items.length === 0 && (
                                <p className="text-[10px] text-white/20 italic pl-5 py-2">
                                    No requests inside
                                </p>
                            )}
                        </div>
                    </div>
                ))}
                {collections.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 py-16 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                        <Upload className="w-8 h-8 text-white/20 mb-2 stroke-[1.5]" />
                        <p className="text-xs text-white/50 font-bold mb-1">No collections found</p>
                        <p className="text-[10px] text-white/30 max-w-[160px] mx-auto mb-3">
                            Import a Postman collection JSON or add a new workspace collection.
                        </p>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleImportClick}
                            className="h-7 text-[10px] border-white/10 hover:bg-white/5"
                        >
                            Import File
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
