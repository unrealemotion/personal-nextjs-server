export function stripJsonComments(str: string): string {
    if (!str) return str;
    return str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}
