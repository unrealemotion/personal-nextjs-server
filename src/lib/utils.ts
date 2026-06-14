import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { stripJsonComments } from "./executor-utils"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import { type ApiFolder, type ApiRequest } from "./schema";

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

