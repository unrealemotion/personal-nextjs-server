let dbInstance: IDBDatabase | null = null;

const DB_NAME = "SurgeWorkspaceDB";
const STORE_NAME = "stateStore";
const DB_KEY = "workspaceState";

function getDB(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("Browser environment required for IndexedDB"));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onversionchange = () => {
                dbInstance?.close();
                dbInstance = null;
            };
            resolve(dbInstance);
        };
        request.onerror = () => reject(request.error);
    });
}

function runTx<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    return getDB().then((db) => {
        return new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);
            const request = operation(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    });
}

function runReadTx<T>(operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    return runTx<T>("readonly", operation);
}

function runWriteTx<T>(operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    return runTx<T>("readwrite", operation);
}

export function saveToDB(value: any, key: string = DB_KEY): Promise<void> {
    return runWriteTx<void>((store) => store.put(value, key));
}

export function loadFromDB(key: string = DB_KEY): Promise<any> {
    return runReadTx((store) => store.get(key)).catch((e) => {
        console.warn(`Failed to load key ${key} from IndexedDB:`, e);
        return null;
    });
}

export function deleteFromDB(key: string): Promise<void> {
    return runWriteTx<void>((store) => store.delete(key));
}

export function clearDB(): Promise<void> {
    return runWriteTx<void>((store) => store.clear());
}

export const saveCheckpoint = async (messageId: string, stateSnapshot: any) => {
    await saveToDB(stateSnapshot, `checkpoint_${messageId}`);
};

export const loadCheckpoint = async (messageId: string) => {
    return await loadFromDB(`checkpoint_${messageId}`);
};

export const deleteCheckpoint = async (messageId: string) => {
    await deleteFromDB(`checkpoint_${messageId}`);
};
