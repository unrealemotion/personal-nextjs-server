import { importPostmanCollection } from "./postman";
import { resolveVariables, runPreRequestScript, runTestScript } from "./sandbox";
import { type Environment } from "./schema";

console.log("=== API CLIENT CORE TESTING ===");

const sampleCollectionJson = JSON.stringify({
    info: {
        name: "Test Postman Collection",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: [
        {
            name: "Get User Info",
            request: {
                method: "GET",
                header: [
                    { key: "Authorization", value: "Bearer {{token}}" }
                ],
                url: {
                    raw: "https://api.example.com/users/{{userId}}?active=true",
                    protocol: "https",
                    host: ["api", "example", "com"],
                    path: ["users", "{{userId}}"],
                    query: [
                        { key: "active", value: "true" }
                    ]
                }
            },
            event: [
                {
                    listen: "prerequest",
                    script: {
                        exec: [
                            "pm.environment.set('token', 'SECRET_TOKEN_123');",
                            "pm.request.headers.add({ key: 'X-Trigger', value: 'PreScript' });"
                        ]
                    }
                },
                {
                    listen: "test",
                    script: {
                        exec: [
                            "pm.test('Status is 200', () => { pm.expect(pm.response.code).to.have.status(200); });",
                            "pm.test('Response is json', () => { pm.expect(pm.response.json()).to.be.a('object'); });",
                            "pm.test('Assert user id matching', () => {",
                            "  const body = pm.response.json();",
                            "  pm.expect(body.id).to.eql(42);",
                            "});"
                        ]
                    }
                }
            ]
        }
    ],
    variable: [
        { key: "userId", value: "42" }
    ]
});

console.log("\n1. Testing Postman Collection JSON Import...");
const imported = importPostmanCollection(sampleCollectionJson);
console.log("Collection Name:", imported.name);
console.log("Number of Items:", imported.items.length);
console.log("Collection Variables:", JSON.stringify(imported.variables));
const requestItem = imported.items[0] as any;
console.log("Request Name:", requestItem.name);
console.log("Request Method:", requestItem.method);
console.log("Request URL:", requestItem.url);

console.log("\n2. Testing Variable Resolution...");
const mockEnvironments: Environment[] = [
    {
        id: "env-1",
        name: "Dev Environment",
        variables: [
            { key: "token", value: "INITIAL_TOKEN", enabled: true }
        ]
    },
    {
        id: "globals",
        name: "Globals",
        variables: [
            { key: "globalVar", value: "GLOBAL_VAL", enabled: true }
        ]
    }
];
const textToResolve = "Bearer {{token}} for user {{userId}}";
const resolved = resolveVariables(textToResolve, mockEnvironments, "env-1", imported.variables);
console.log("Source Text:", textToResolve);
console.log("Resolved Text:", resolved);

console.log("\n3. Testing Pre-request script sandbox...");
const preReqResult = runPreRequestScript(
    requestItem.preRequestScript,
    mockEnvironments,
    "env-1",
    imported.variables
);
console.log("Updated Env Variables:", JSON.stringify(preReqResult.updatedEnvironments[0].variables));
console.log("Added Headers:", JSON.stringify(preReqResult.addedHeaders));

console.log("\n4. Testing Test Script sandbox and assertions...");
const mockResponse = {
    status: 200,
    statusText: "OK",
    body: JSON.stringify({ id: 42, username: "dev_user" }),
    headers: { "content-type": "application/json" }
};
const testResult = runTestScript(
    requestItem.testScript,
    mockResponse,
    preReqResult.updatedEnvironments,
    "env-1",
    imported.variables
);
console.log("Test Results:", JSON.stringify(testResult.testResults, null, 2));

console.log("\n5. Testing Global Variables and pm.globals...");
const envsWithGlobals = preReqResult.updatedEnvironments;
const resolvedWithGlobal = resolveVariables("Value is {{globalVar}} and token is {{token}}", envsWithGlobals, "env-1");
console.log("Resolved with global variable:", resolvedWithGlobal);

const testScriptWithGlobals = `
    pm.globals.set('newGlobal', 'NEW_GLOBAL_VAL');
    pm.test('Global check', () => {
        pm.expect(pm.globals.get('globalVar')).to.eql('GLOBAL_VAL');
        pm.expect(pm.variables.get('globalVar')).to.eql('GLOBAL_VAL');
    });
`;
const sandboxRes = runTestScript(
    testScriptWithGlobals,
    mockResponse,
    envsWithGlobals,
    "env-1"
);
console.log("Global Test Script Results:", JSON.stringify(sandboxRes.testResults, null, 2));
const globalNewVal = sandboxRes.updatedEnvironments.find(e => e.id === "globals")?.variables.find(v => v.key === "newGlobal")?.value;
console.log("New Global value set by sandbox:", globalNewVal);

console.log("\n6. Testing processTemplateForFormatting (template-safe Beautifier)...");
import { processTemplateForFormatting } from "./utils";
const jsonWithVariables = `
{
    // A comment here
    "id": {{userId}},
    "name": "{{username}}",
    "active": true
}
`;
try {
    const formatted = processTemplateForFormatting(jsonWithVariables);
    console.log("Formatted JSON:\n", formatted);
} catch (e: any) {
    console.error("Failed to format JSON with variables:", e.message);
}

console.log("\n=== TESTING COMPLETED ===");
