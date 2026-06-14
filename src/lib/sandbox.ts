import { type Environment, type TestResult, type KeyValuePair } from "./schema";

export function resolveVariables(
    text: string,
    environments: Environment[],
    activeEnvironmentId: string | null,
    collectionVariables: KeyValuePair[] = []
): string {
    if (!text) return text;

    // Get active environment variables mapping
    const activeEnv = environments.find(e => e.id === activeEnvironmentId);
    const envVars: Record<string, string> = {};
    if (activeEnv) {
        activeEnv.variables.forEach(v => {
            if (v.enabled) envVars[v.key] = v.value;
        });
    }

    // Globals variables mapping
    const globalsEnv = environments.find(
        e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
    );
    const globalVars: Record<string, string> = {};
    if (globalsEnv) {
        globalsEnv.variables.forEach(v => {
            if (v.enabled) globalVars[v.key] = v.value;
        });
    }

    // Collection variables mapping
    const colVars: Record<string, string> = {};
    collectionVariables.forEach(v => {
        if (v.enabled !== false) colVars[v.key] = v.value;
    });

    // Merge: collection variables < globals < active environment variables
    const mergedVars = { ...colVars, ...globalVars, ...envVars };

    // Resolve recursively up to 3 times to allow nested resolutions
    let resolved = text;
    for (let depth = 0; depth < 3; depth++) {
        const next = resolved.replace(/\{\{(.+?)\}\}/g, (_, key) => {
            const trimmedKey = key.trim();
            const value = mergedVars[trimmedKey];
            return value !== undefined ? value : `{{${trimmedKey}}}`;
        });
        if (next === resolved) break;
        resolved = next;
    }
    return resolved;
}

function createExpect(actual: any) {
    return {
        to: {
            be: {
                a: (type: string) => {
                    if (typeof actual !== type) {
                        throw new Error(`expected type '${type}', got '${typeof actual}'`);
                    }
                },
                get ok() {
                    if (!actual) {
                        throw new Error(`expected value to be truthy, got ${actual}`);
                    }
                    return true;
                },
                get true() {
                    if (actual !== true) {
                        throw new Error(`expected true, got ${actual}`);
                    }
                    return true;
                },
                get false() {
                    if (actual !== false) {
                        throw new Error(`expected false, got ${actual}`);
                    }
                    return true;
                },
                get null() {
                    if (actual !== null) {
                        throw new Error(`expected null, got ${actual}`);
                    }
                    return true;
                },
                get undefined() {
                    if (actual !== undefined) {
                        throw new Error(`expected undefined, got ${actual}`);
                    }
                    return true;
                },
                get empty() {
                    if (actual && typeof actual === "object") {
                        if (Object.keys(actual).length > 0) throw new Error("expected object to be empty");
                    } else if (actual && actual.length > 0) {
                        throw new Error("expected array/string to be empty");
                    }
                    return true;
                }
            },
            have: {
                status: (expected: number) => {
                    if (actual !== expected) {
                        throw new Error(`expected status code ${expected}, got ${actual}`);
                    }
                },
                header: (headerName: string) => {
                    if (!actual || !actual[headerName]) {
                        throw new Error(`expected header '${headerName}' to exist`);
                    }
                }
            },
            eql: (expected: any) => {
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            },
            include: (expected: any) => {
                if (typeof actual === "string" || Array.isArray(actual)) {
                    if (!actual.includes(expected)) {
                        throw new Error(`expected element to include '${expected}'`);
                    }
                } else if (actual && typeof actual === "object") {
                    if (!(expected in actual)) {
                        throw new Error(`expected object to contain key '${expected}'`);
                    }
                } else {
                    throw new Error("unsupported type for inclusion check");
                }
            }
        }
    };
}

export function runPreRequestScript(
    script: string,
    environments: Environment[],
    activeEnvironmentId: string | null,
    collectionVariables: KeyValuePair[] = []
): {
    updatedEnvironments: Environment[];
    addedHeaders: { key: string; value: string }[];
} {
    const addedHeaders: { key: string; value: string }[] = [];
    const localEnvs = JSON.parse(JSON.stringify(environments)) as Environment[];
    const activeEnv = localEnvs.find(e => e.id === activeEnvironmentId);

    let globalsEnv = localEnvs.find(
        e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
    );
    if (!globalsEnv) {
        globalsEnv = {
            id: "globals",
            name: "Globals",
            variables: []
        };
        localEnvs.push(globalsEnv);
    }

    const envGetterSetter = {
        get: (key: string) => {
            if (!activeEnv) return undefined;
            const variable = activeEnv.variables.find(v => v.key === key);
            return variable?.value;
        },
        set: (key: string, value: string) => {
            if (!activeEnv) return;
            const variable = activeEnv.variables.find(v => v.key === key);
            if (variable) {
                variable.value = value;
            } else {
                activeEnv.variables.push({ key, value, enabled: true });
            }
        },
        has: (key: string) => {
            if (!activeEnv) return false;
            return activeEnv.variables.some(v => v.key === key);
        },
        unset: (key: string) => {
            if (!activeEnv) return;
            activeEnv.variables = activeEnv.variables.filter(v => v.key !== key);
        }
    };

    const globalsGetterSetter = {
        get: (key: string) => {
            if (!globalsEnv) return undefined;
            const variable = globalsEnv.variables.find(v => v.key === key);
            return variable?.value;
        },
        set: (key: string, value: string) => {
            if (!globalsEnv) return;
            const variable = globalsEnv.variables.find(v => v.key === key);
            if (variable) {
                variable.value = value;
            } else {
                globalsEnv.variables.push({ key, value, enabled: true });
            }
        },
        has: (key: string) => {
            if (!globalsEnv) return false;
            return globalsEnv.variables.some(v => v.key === key);
        },
        unset: (key: string) => {
            if (!globalsEnv) return;
            globalsEnv.variables = globalsEnv.variables.filter(v => v.key !== key);
        }
    };

    const variablesGetter = {
        get: (key: string) => {
            const envVal = envGetterSetter.get(key);
            if (envVal !== undefined) return envVal;
            const globalVal = globalsGetterSetter.get(key);
            if (globalVal !== undefined) return globalVal;
            const colVal = collectionVariables.find(v => v.key === key);
            return colVal?.value;
        }
    };

    const requestObj = {
        headers: {
            add: (h: { key: string; value: string }) => {
                addedHeaders.push(h);
            },
            remove: (key: string) => {
                const idx = addedHeaders.findIndex(h => h.key.toLowerCase() === key.toLowerCase());
                if (idx !== -1) addedHeaders.splice(idx, 1);
            }
        }
    };

    const pm = {
        environment: envGetterSetter,
        globals: globalsGetterSetter,
        variables: variablesGetter,
        request: requestObj,
        test: () => {
            throw new Error("Tests cannot be run in pre-request scripts");
        },
        expect: createExpect,
    };

    if (script && script.trim()) {
        try {
            const shadowKeys = ["window", "document", "localStorage", "sessionStorage", "cookieStore", "indexedDB", "XMLHttpRequest", "fetch"];
            const shadowValues = shadowKeys.map(() => undefined);
            const runner = new Function("pm", ...shadowKeys, `"use strict";\n` + script);
            runner(pm, ...shadowValues);
        } catch (e: any) {
            console.error("Error executing pre-request script:", e);
            throw new Error(`Pre-request script failed: ${e.message}`);
        }
    }

    return {
        updatedEnvironments: localEnvs,
        addedHeaders,
    };
}

export function runTestScript(
    script: string,
    response: {
        status: number;
        statusText: string;
        body: string;
        headers: Record<string, string>;
    },
    environments: Environment[],
    activeEnvironmentId: string | null,
    collectionVariables: KeyValuePair[] = []
): {
    updatedEnvironments: Environment[];
    testResults: TestResult[];
} {
    const testResults: TestResult[] = [];
    const localEnvs = JSON.parse(JSON.stringify(environments)) as Environment[];
    const activeEnv = localEnvs.find(e => e.id === activeEnvironmentId);

    let globalsEnv = localEnvs.find(
        e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
    );
    if (!globalsEnv) {
        globalsEnv = {
            id: "globals",
            name: "Globals",
            variables: []
        };
        localEnvs.push(globalsEnv);
    }

    const envGetterSetter = {
        get: (key: string) => {
            if (!activeEnv) return undefined;
            const variable = activeEnv.variables.find(v => v.key === key);
            return variable?.value;
        },
        set: (key: string, value: string) => {
            if (!activeEnv) return;
            const variable = activeEnv.variables.find(v => v.key === key);
            if (variable) {
                variable.value = value;
            } else {
                activeEnv.variables.push({ key, value, enabled: true });
            }
        },
        has: (key: string) => {
            if (!activeEnv) return false;
            return activeEnv.variables.some(v => v.key === key);
        },
        unset: (key: string) => {
            if (!activeEnv) return;
            activeEnv.variables = activeEnv.variables.filter(v => v.key !== key);
        }
    };

    const globalsGetterSetter = {
        get: (key: string) => {
            if (!globalsEnv) return undefined;
            const variable = globalsEnv.variables.find(v => v.key === key);
            return variable?.value;
        },
        set: (key: string, value: string) => {
            if (!globalsEnv) return;
            const variable = globalsEnv.variables.find(v => v.key === key);
            if (variable) {
                variable.value = value;
            } else {
                globalsEnv.variables.push({ key, value, enabled: true });
            }
        },
        has: (key: string) => {
            if (!globalsEnv) return false;
            return globalsEnv.variables.some(v => v.key === key);
        },
        unset: (key: string) => {
            if (!globalsEnv) return;
            globalsEnv.variables = globalsEnv.variables.filter(v => v.key !== key);
        }
    };

    const variablesGetter = {
        get: (key: string) => {
            const envVal = envGetterSetter.get(key);
            if (envVal !== undefined) return envVal;
            const globalVal = globalsGetterSetter.get(key);
            if (globalVal !== undefined) return globalVal;
            const colVal = collectionVariables.find(v => v.key === key);
            return colVal?.value;
        }
    };

    const responseObj = {
        code: response.status,
        status: response.statusText,
        headers: response.headers,
        text: () => response.body,
        json: () => {
            try {
                return JSON.parse(response.body);
            } catch {
                return null;
            }
        }
    };

    const pm = {
        environment: envGetterSetter,
        globals: globalsGetterSetter,
        variables: variablesGetter,
        response: responseObj,
        test: (name: string, fn: () => void) => {
            try {
                fn();
                testResults.push({ name, passed: true });
            } catch (e: any) {
                testResults.push({ name, passed: false, error: e.message || String(e) });
            }
        },
        expect: (val: any) => createExpect(val),
    };

    if (script && script.trim()) {
        try {
            const shadowKeys = ["window", "document", "localStorage", "sessionStorage", "cookieStore", "indexedDB", "XMLHttpRequest", "fetch"];
            const shadowValues = shadowKeys.map(() => undefined);
            const runner = new Function("pm", ...shadowKeys, `"use strict";\n` + script);
            runner(pm, ...shadowValues);
        } catch (e: any) {
            console.error("Error executing test script:", e);
            testResults.push({ name: "Script Execution Error", passed: false, error: e.message || String(e) });
        }
    }

    return {
        updatedEnvironments: localEnvs,
        testResults,
    };
}
