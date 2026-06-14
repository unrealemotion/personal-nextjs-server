import React from "react";

export function renderMarkdown(text: string) {
    if (!text) return null;

    // 1. Split by code blocks
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
        if (part.startsWith("```")) {
            // Code block
            const lines = part.split("\n");
            const firstLine = lines[0];
            const language = firstLine.slice(3).trim();
            const codeContent = lines.slice(1, -1).join("\n");
            
            return (
                <div key={index} className="my-2 border border-white/10 rounded-lg overflow-hidden bg-neutral-950">
                    {language && (
                        <div className="bg-neutral-905 px-3 py-1 text-[10px] text-white/40 font-mono border-b border-white/5 flex justify-between items-center bg-neutral-900">
                            <span>{language}</span>
                        </div>
                    )}
                    <pre className="p-3 overflow-x-auto text-[10px] font-mono text-white/80 whitespace-pre">
                        <code>{codeContent}</code>
                    </pre>
                </div>
            );
        } else {
            // Inline text and line-by-line parsing
            const lines = part.split("\n");
            let inList = false;
            let listItems: React.ReactNode[] = [];
            const renderedElements: React.ReactNode[] = [];
            
            let inTable = false;
            let tableData: string[][] = [];

            const parseInline = (lineText: string): React.ReactNode[] => {
                // simple parser for bold, italic, inline code, and links
                const inlineParts = lineText.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\)|_.*?_)/g);
                return inlineParts.flatMap((subPart, subIdx) => {
                    if (subPart.startsWith("**") && subPart.endsWith("**")) {
                        return <strong key={subIdx} className="font-bold text-white">{subPart.slice(2, -2)}</strong>;
                    }
                    if (subPart.startsWith("*") && subPart.endsWith("*")) {
                        return <em key={subIdx} className="italic text-white/90">{subPart.slice(1, -1)}</em>;
                    }
                    if (subPart.startsWith("_") && subPart.endsWith("_")) {
                        return <em key={subIdx} className="italic text-white/90">{subPart.slice(1, -1)}</em>;
                    }
                    if (subPart.startsWith("`") && subPart.endsWith("`")) {
                        return <code key={subIdx} className="font-mono bg-neutral-950 px-1.5 py-0.5 rounded text-indigo-300 text-[10px] border border-white/5">{subPart.slice(1, -1)}</code>;
                    }
                    if (subPart.startsWith("[") && subPart.includes("](")) {
                        const match = subPart.match(/\[(.*?)\]\((.*?)\)/);
                        if (match) {
                            return (
                                <a 
                                    key={subIdx} 
                                    href={match[2]} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-indigo-400 hover:underline hover:text-indigo-300 font-semibold"
                                >
                                    {match[1]}
                                </a>
                            );
                        }
                    }
                    
                    // Auto-link raw URLs in plain text parts
                    const urlRegex = /(https?:\/\/[^\s\)]+?(?=[.,;?!]?(?:\s|$)))/g;
                    const textParts = subPart.split(urlRegex);
                    if (textParts.length > 1) {
                        return textParts.map((textPart, textIdx) => {
                            if (textPart.startsWith("http://") || textPart.startsWith("https://")) {
                                return (
                                    <a
                                        key={`${subIdx}-url-${textIdx}`}
                                        href={textPart}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-400 hover:underline hover:text-indigo-300 font-semibold"
                                    >
                                        {textPart}
                                    </a>
                                );
                            }
                            return textPart;
                        });
                    }

                    return subPart;
                });
            };

            const flushList = () => {
                if (inList && listItems.length > 0) {
                    renderedElements.push(
                        <ul key={`list-${renderedElements.length}`} className="my-2 space-y-1">
                            {listItems}
                        </ul>
                    );
                    listItems = [];
                }
                inList = false;
            };

            const flushTable = () => {
                if (inTable && tableData.length > 0) {
                    const hasHeader = tableData.length > 1 && tableData[1].every(cell => cell.length > 0 && cell.match(/^[-: ]+$/));
                    
                    let thead = null;
                    let tbodyRows = tableData;

                    if (hasHeader) {
                        thead = tableData[0];
                        tbodyRows = tableData.slice(2); // Skip header and separator
                    }

                    renderedElements.push(
                        <div key={`table-${renderedElements.length}`} className="my-3 overflow-x-auto border border-white/10 rounded-lg">
                            <table className="w-full text-left border-collapse text-[10px]">
                                {thead && (
                                    <thead className="bg-white/5 border-b border-white/10">
                                        <tr>
                                            {thead.map((cell, i) => (
                                                <th key={i} className="px-3 py-2 font-semibold text-white/90 border-r border-white/5 last:border-0">
                                                    {parseInline(cell)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                )}
                                <tbody className="divide-y divide-white/5 bg-neutral-900/50">
                                    {tbodyRows.map((row, rIdx) => (
                                        <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                                            {row.map((cell, cIdx) => (
                                                <td key={cIdx} className="px-3 py-2 text-white/80 border-r border-white/5 last:border-0">
                                                    {parseInline(cell)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                    tableData = [];
                }
                inTable = false;
            };

            lines.forEach((line, lineIdx) => {
                const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
                const orderedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
                const h3Match = line.match(/^###\s+(.*)$/);
                const h2Match = line.match(/^##\s+(.*)$/);
                const h1Match = line.match(/^#\s+(.*)$/);
                
                const trimmedLine = line.trim();
                const isTableRow = trimmedLine.startsWith("|") && trimmedLine.endsWith("|");
                const isEmptyLine = trimmedLine.length === 0;

                if (isTableRow) {
                    flushList();
                    inTable = true;
                    const parts = trimmedLine.split("|");
                    const cells = parts.slice(1, parts.length - 1).map(c => c.trim());
                    tableData.push(cells);
                } else if (isEmptyLine && inTable) {
                    // Tolerate empty lines within table parsing
                } else {
                    flushTable();

                    if (listMatch) {
                        inList = true;
                        listItems.push(
                            <li key={lineIdx} className="list-disc ml-4 mb-1 text-white/90">
                                {parseInline(listMatch[1])}
                            </li>
                        );
                    } else if (orderedMatch) {
                        inList = true;
                        listItems.push(
                            <li key={lineIdx} className="list-decimal ml-4 mb-1 text-white/90">
                                {parseInline(orderedMatch[2])}
                            </li>
                        );
                    } else {
                        flushList();

                        if (h3Match) {
                            renderedElements.push(
                                <h3 key={lineIdx} className="text-sm font-bold text-white mt-4 mb-1">
                                    {parseInline(h3Match[1])}
                                </h3>
                            );
                        } else if (h2Match) {
                            renderedElements.push(
                                <h2 key={lineIdx} className="text-base font-extrabold text-white mt-5 mb-2 border-b border-white/5 pb-1">
                                    {parseInline(h2Match[1])}
                                </h2>
                            );
                        } else if (h1Match) {
                            renderedElements.push(
                                <h1 key={lineIdx} className="text-lg font-black text-white mt-6 mb-2">
                                    {parseInline(h1Match[1])}
                                </h1>
                            );
                        } else if (line.trim().length > 0) {
                            renderedElements.push(
                                <p key={lineIdx} className="mb-2 text-white/90">
                                    {parseInline(line)}
                                </p>
                            );
                        } else {
                            renderedElements.push(<div key={lineIdx} className="h-2" />);
                        }
                    }
                }
            });

            flushList();
            flushTable();

            return <React.Fragment key={index}>{renderedElements}</React.Fragment>;
        }
    });
}
