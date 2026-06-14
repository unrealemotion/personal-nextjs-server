export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === "string") {
                resolve(content);
            } else {
                reject(new Error("File content is not a string"));
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}
