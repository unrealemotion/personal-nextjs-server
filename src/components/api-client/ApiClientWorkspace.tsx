"use client";

import React from "react";
import { useStore } from "@tanstack/react-store";
import { store } from "@/lib/store";
import { CollectionSidebar } from "./CollectionSidebar";
import { RequestPanel } from "./RequestPanel";
import { ResponsePanel } from "./ResponsePanel";

export function ApiClientWorkspace() {
    const apiTabs = useStore(store, (state) => state.apiTabs);
    const activeTabId = useStore(store, (state) => state.activeTabId);
    
    const activeTab = apiTabs.find(t => t.id === activeTabId);

    return (
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
            {/* Left: Collections Sidebar Tree */}
            <div className="lg:col-span-2 lg:h-[800px] flex flex-col min-h-0">
                <CollectionSidebar />
            </div>

            {/* Middle: Request details editor */}
            <div className="lg:col-span-5 lg:h-[800px] flex flex-col min-h-0">
                <RequestPanel />
            </div>

            {/* Right: Response results inspector */}
            <div className="lg:col-span-5 lg:h-[800px] flex flex-col min-h-0">
                <ResponsePanel 
                    response={activeTab?.response} 
                    loading={activeTab?.loading || false} 
                />
            </div>
        </div>
    );
}
