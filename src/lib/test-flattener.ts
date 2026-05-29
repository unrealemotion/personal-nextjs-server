import { jsonToTableData } from "./flattener";

const testCases = [
  {
    name: "Simple Object with Array (Split and Flatten)",
    input: {
      name: { first: "John", last: "Doe" },
      skills: ["fly", "counting"]
    },
    options: { flattenObjects: true, splitArrays: true }
  },
  {
    name: "Simple Object with Array (No Split, Flatten)",
    input: {
      name: { first: "John", last: "Doe" },
      skills: ["fly", "counting"]
    },
    options: { flattenObjects: true, splitArrays: false }
  },
  {
    name: "Deep Object with Dual Arrays (Split and Flatten)",
    input: {
      user: {
        name: "Alice",
        languages: ["English", "Vietnamese"],
        interests: ["Coding"]
      }
    },
    options: { flattenObjects: true, splitArrays: true }
  },
  {
    name: "Array of Objects with Nested Array (Split and Flatten)",
    input: [
      {
        id: 1,
        profile: { name: "Bob" },
        roles: [{ name: "Admin", active: true }, { name: "Editor", active: false }]
      }
    ],
    options: { flattenObjects: true, splitArrays: true }
  }
];

console.log("=== RUNNING FLATTENER TESTS ===");
for (const tc of testCases) {
  console.log(`\nTest Case: ${tc.name}`);
  console.log(`Options: ${JSON.stringify(tc.options)}`);
  try {
    const result = jsonToTableData(tc.input, tc.options);
    console.log("Result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("FAILED with error:", err);
  }
}
