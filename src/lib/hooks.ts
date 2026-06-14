import React, { useRef, useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { store } from "./store";
import { readFileAsText } from "./file-utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function useFileImporter(
    onImport: (content: string) => void | Promise<void>,
    onError: (err: any) => void
) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const content = await readFileAsText(file);
            await onImport(content);
        } catch (err) {
            onError(err);
        }
        e.target.value = "";
    };

    return { fileInputRef, handleImportClick, handleFileChange };
}

export function useMonacoDecorations(updateDecorations: () => void) {
    const latestUpdateDecorationsRef = useRef(updateDecorations);
    latestUpdateDecorationsRef.current = updateDecorations;

    const debouncedUpdateDecorations = useMemo(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        return () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                latestUpdateDecorationsRef.current();
            }, 400);
        };
    }, []);

    return debouncedUpdateDecorations;
}

export function useCommonStoreState() {
    const collections = useStore(store, (state) => state.collections);
    const environments = useStore(store, (state) => state.environments);
    const activeEnvironmentId = useStore(store, (state) => state.activeEnvironmentId);
    
    return { collections, environments, activeEnvironmentId };
}

export function useSortableStyle(id: string) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return { attributes, listeners, setNodeRef, style };
}

