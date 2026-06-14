import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { stripJsonComments } from "./strip-comments"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import { type ApiFolder, type ApiRequest, type ApiCollection } from "./schema";
import { parseCurl } from "./curl";

export function processTemplateForFormatting(str: string): string {
  if (!str) return str;
  const stripped = stripJsonComments(str);
  
  const placeholders: { id: string; original: string; quoted: boolean }[] = [];
  let counter = 0;
  
  let working = stripped;
  
  // Replace quoted template variables first
  working = working.replace(/"\{\{([\s\S]*?)\}\}"/g, (match) => {
    const id = `__QUOTED_TEMP_VAR_${counter++}__`;
    placeholders.push({ id, original: match, quoted: true });
    return `"${id}"`;
  });
  
  // Replace unquoted template variables next
  working = working.replace(/\{\{([\s\S]*?)\}\}/g, (match) => {
    const id = `__UNQUOTED_TEMP_VAR_${counter++}__`;
    placeholders.push({ id, original: match, quoted: false });
    return `"${id}"`;
  });
  
  try {
    const parsed = JSON.parse(working);
    let beautified = JSON.stringify(parsed, null, 2);
    
    for (let i = placeholders.length - 1; i >= 0; i--) {
      const p = placeholders[i];
      beautified = beautified.replaceAll(`"${p.id}"`, p.original);
    }
    return beautified;
  } catch (e) {
    throw e;
  }
}

export function addItemToCollectionTree(
  items: (ApiFolder | ApiRequest)[],
  targetId: string,
  newItem: ApiFolder | ApiRequest
): { success: boolean; newItems: (ApiFolder | ApiRequest)[] } {
  let found = false;
  const updated = items.map(item => {
    if ("items" in item) { // Folder
      if (item.id === targetId) {
        found = true;
        return {
          ...item,
          items: [...item.items, newItem]
        };
      } else {
        const res = addItemToCollectionTree(item.items, targetId, newItem);
        if (res.success) {
          found = true;
          return {
            ...item,
            items: res.newItems
          };
        }
      }
    }
    return item;
  });

  return { success: found, newItems: updated };
}

export function findParentCollection(collections: ApiCollection[], requestId: string): ApiCollection | null {
  const findInItems = (items: any[]): boolean => {
    return items.some(item => {
      if (item.id === requestId) return true;
      if (item.items) return findInItems(item.items);
      return false;
    });
  };
  return collections.find(c => findInItems(c.items)) || null;
}

export function findItemInCollections(collections: any[], id: string): any | null {
  const search = (items: any[]): any | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.items) {
        const found = search(item.items);
        if (found) return found;
      }
    }
    return null;
  };
  for (const col of collections) {
    const found = search(col.items);
    if (found) return found;
  }
  return null;
}

export function getRawLanguageContentType(lang: string): string {
  if (lang === "text") return "text/plain";
  if (lang === "javascript") return "application/javascript";
  if (lang === "html") return "text/html";
  if (lang === "xml") return "application/xml";
  return "application/json";
}

export function parseQueryParams(url: string): { key: string; value: string; enabled: boolean }[] {
  const params: { key: string; value: string; enabled: boolean }[] = [];
  if (!url) return params;
  try {
    const queryIdx = url.indexOf("?");
    if (queryIdx !== -1) {
      const search = url.slice(queryIdx + 1);
      const pairs = search.split("&");
      pairs.forEach(p => {
        if (!p) return;
        const [k, v] = p.split("=");
        params.push({
          key: decodeURIComponent(k || ""),
          value: decodeURIComponent(v || ""),
          enabled: true
        });
      });
    }
  } catch {}
  return params;
}

export function addMonacoDecoration(model: any, monaco: any, match: any, isAvailable: boolean, newDecorations: any[]) {
  const startPos = model.getPositionAt(match.index);
  const endPos = model.getPositionAt(match.index + match[0].length);
  newDecorations.push({
    range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
    options: { 
      inlineClassName: isAvailable ? 'monaco-template-variable' : 'monaco-template-variable-invalid'
    }
  });
}

export function setupMonacoJsonEditor(editor: any, monaco: any, onContentChange: () => void) {
  monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions({
    validate: false,
  });

  editor.onDidChangeModelContent(() => {
    onContentChange();
  });
}

export function getMonacoTextAndModel(editor: any, monaco: any): { editor: any; model: any; text: string; monaco: any } | null {
  if (!editor || !monaco) return null;
  const model = editor.getModel();
  if (!model) return null;
  return { editor, model, text: model.getValue(), monaco };
}

export function handleUrlPasteHelper(
  pastedText: string,
  onParsed: (parsed: any) => void,
  onError: (msg: string) => void
): boolean {
  if (pastedText.trim().startsWith("curl ")) {
    const parsed = parseCurl(pastedText);
    if (parsed) {
      onParsed(parsed);
    } else {
      onError("Invalid or unsupported cURL command");
    }
    return true;
  }
  return false;
}




