export interface ConvertOptions {
  flattenObjects: boolean;
  splitArrays: boolean;
}

/**
 * Converts a JSON value (either a single object or an array of objects) into a flat array of row objects
 * following the recursive flattening and splitting options.
 */
export function jsonToTableData(jsonVal: any, options: ConvertOptions): any[] {
  if (jsonVal === null || jsonVal === undefined) {
    return [];
  }

  // If the root is an array, process each item and concatenate the expanded rows
  if (Array.isArray(jsonVal)) {
    const allRows: any[] = [];
    for (const item of jsonVal) {
      allRows.push(...expandItem(item, options));
    }
    return allRows;
  }

  // Otherwise, treat as a single item
  return expandItem(jsonVal, options);
}

// Helper to process a value at a given path into an array of rows
function processField(rows: any[], val: any, path: string, options: ConvertOptions): any[] {
  // 1. Handle Null or Undefined
  if (val === null || val === undefined) {
    return rows.map((r) => ({ ...r, [path]: null }));
  }

  // 2. Handle Arrays
  if (Array.isArray(val)) {
    if (options.splitArrays) {
      if (val.length === 0) {
        return rows.map((r) => ({ ...r, [path]: null }));
      }

      const nextRows: any[] = [];
      for (const r of rows) {
        for (const el of val) {
          const subRows = expandValue(el, path, options);
          for (const subRow of subRows) {
            nextRows.push({ ...r, ...subRow });
          }
        }
      }
      return nextRows;
    } else {
      return rows.map((r) => ({ ...r, [path]: JSON.stringify(val) }));
    }
  }

  // 3. Handle Nested Objects
  if (typeof val === "object") {
    if (options.flattenObjects) {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        return rows.map((r) => ({ ...r, [path]: "{}" }));
      }

      let tempRows = [...rows];
      for (const k of keys) {
        const subPath = path ? `${path}.${k}` : k;
        tempRows = processField(tempRows, val[k], subPath, options);
      }
      return tempRows;
    } else {
      return rows.map((r) => ({ ...r, [path]: JSON.stringify(val) }));
    }
  }

  // 4. Handle Primitives
  return rows.map((r) => ({ ...r, [path]: val }));
}

// Helper to expand a sub-value at a specific path, returning an array of sub-row objects
function expandValue(val: any, path: string, options: ConvertOptions): any[] {
  if (val === null || val === undefined) {
    return [{ [path]: null }];
  }

  if (Array.isArray(val)) {
    if (options.splitArrays) {
      if (val.length === 0) {
        return [{ [path]: null }];
      }
      const nextRows: any[] = [];
      for (const el of val) {
        nextRows.push(...expandValue(el, path, options));
      }
      return nextRows;
    } else {
      return [{ [path]: JSON.stringify(val) }];
    }
  }

  if (typeof val === "object") {
    if (options.flattenObjects) {
      let subRows: any[] = [{}];
      const keys = Object.keys(val);
      if (keys.length === 0) {
        return [{ [path]: "{}" }];
      }
      for (const k of keys) {
        const subPath = path ? `${path}.${k}` : k;
        subRows = processField(subRows, val[k], subPath, options);
      }
      return subRows;
    } else {
      return [{ [path]: JSON.stringify(val) }];
    }
  }

  return [{ [path]: val }];
}

/**
 * Expands a single item (object or primitive) into one or more flat rows.
 */
function expandItem(item: any, options: ConvertOptions): any[] {
  // If the item itself is primitive, wrap it in a default column
  if (item === null || typeof item !== "object") {
    return [{ value: item }];
  }

  let currentRows: any[] = [{}];

  // Process all top-level keys
  const keys = Object.keys(item);
  if (keys.length === 0) {
    return [{}];
  }

  for (const k of keys) {
    currentRows = processField(currentRows, item[k], k, options);
  }

  return currentRows;
}

/**
 * Extracts a unique list of all columns across all generated rows.
 */
export function getColumnsFromRows(rows: any[]): string[] {
  const columnsSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnsSet.add(key);
    }
  }
  return Array.from(columnsSet);
}

export interface SemanticDiff {
  type: "identical" | "different";
  added: string[];
  removed: string[];
  modified: Array<{
    path: string;
    oldValue: any;
    newValue: any;
  }>;
}

/**
 * Recursively compares two parsed objects/arrays to compute a semantic diff.
 */
export function computeSemanticDiff(left: any, right: any): SemanticDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: Array<{ path: string; oldValue: any; newValue: any }> = [];

  function compare(l: any, r: any, path: string) {
    if (l === r) return;

    const typeL = typeof l;
    const typeR = typeof r;

    // If type mismatches or one is null (since typeof null === 'object')
    if (typeL !== typeR || l === null || r === null) {
      modified.push({ path, oldValue: l, newValue: r });
      return;
    }

    // If both are arrays
    if (Array.isArray(l) && Array.isArray(r)) {
      const maxLen = Math.max(l.length, r.length);
      for (let i = 0; i < maxLen; i++) {
        const subPath = `${path}[${i}]`;
        if (i >= l.length) {
          added.push(subPath);
        } else if (i >= r.length) {
          removed.push(subPath);
        } else {
          compare(l[i], r[i], subPath);
        }
      }
      return;
    }

    // If both are objects
    if (typeL === "object") {
      const keysL = Object.keys(l);
      const keysR = Object.keys(r);
      const allKeys = Array.from(new Set([...keysL, ...keysR]));

      for (const key of allKeys) {
        const subPath = path ? `${path}.${key}` : key;
        const hasL = key in l;
        const hasR = key in r;

        if (hasL && !hasR) {
          removed.push(subPath);
        } else if (!hasL && hasR) {
          added.push(subPath);
        } else {
          compare(l[key], r[key], subPath);
        }
      }
      return;
    }

    // Otherwise they are different primitive values
    modified.push({ path, oldValue: l, newValue: r });
  }

  compare(left, right, "");

  return {
    type: added.length === 0 && removed.length === 0 && modified.length === 0 ? "identical" : "different",
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort((a, b) => a.path.localeCompare(b.path))
  };
}

/**
 * Recursively maps all primitive values in a JSON structure to their type descriptors,
 * sorted alphabetically by object key, isolating structure and schema types.
 */
export function getJSONStructure(val: any): any {
  if (val === null) return "<null>";
  if (val === undefined) return "<undefined>";

  if (Array.isArray(val)) {
    if (val.length === 0) return [];
    return val.map(getJSONStructure);
  }

  if (typeof val === "object") {
    const res: any = {};
    const keys = Object.keys(val).sort();
    for (const key of keys) {
      res[key] = getJSONStructure(val[key]);
    }
    return res;
  }

  return `<${typeof val}>`;
}

/**
 * Recursively normalizes a JSON structure.
 * If ignoreOrder is true, it recursively:
 * 1. Sorts all object keys alphabetically.
 * 2. Sorts all array items alphabetically by their stringified representations.
 */
export function normalizeJSONOrder(val: any, ignoreOrder = false): any {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    const mapped = val.map((item) => normalizeJSONOrder(item, ignoreOrder));
    if (ignoreOrder) {
      return mapped.sort((a, b) => {
        const strA = JSON.stringify(a);
        const strB = JSON.stringify(b);
        return strA.localeCompare(strB);
      });
    }
    return mapped;
  }

  if (typeof val === "object") {
    const res: any = {};
    const keys = ignoreOrder ? Object.keys(val).sort() : Object.keys(val);
    for (const key of keys) {
      res[key] = normalizeJSONOrder(val[key], ignoreOrder);
    }
    return res;
  }

  return val;
}

/**
 * Recursively isolates only the keys/values that exist on both sides,
 * ignoring unique structural properties (additions/removals).
 */
export function getSharedValueStructure(l: any, r: any): { leftIsolated: any; rightIsolated: any } {
  if (
    l === null ||
    r === null ||
    typeof l !== "object" ||
    typeof r !== "object" ||
    Array.isArray(l) !== Array.isArray(r)
  ) {
    return { leftIsolated: l, rightIsolated: r };
  }

  if (Array.isArray(l) && Array.isArray(r)) {
    return { leftIsolated: l, rightIsolated: r };
  }

  const keysL = Object.keys(l);
  const keysR = Object.keys(r);
  
  // Intersection of keys
  const sharedKeys = keysL.filter((k) => keysR.includes(k)).sort();
  
  const leftRes: any = {};
  const rightRes: any = {};
  
  for (const key of sharedKeys) {
    const { leftIsolated, rightIsolated } = getSharedValueStructure(l[key], r[key]);
    leftRes[key] = leftIsolated;
    rightRes[key] = rightIsolated;
  }
  
  return { leftIsolated: leftRes, rightIsolated: rightRes };
}
