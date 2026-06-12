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

            lines.forEach((line, lineIdx) => {
                const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
                const orderedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
                const h3Match = line.match(/^###\s+(.*)$/);
                const h2Match = line.match(/^##\s+(.*)$/);
                const h1Match = line.match(/^#\s+(.*)$/);

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
                    if (inList) {
                        renderedElements.push(
                            <ul key={`list-${lineIdx}`} className="my-2 space-y-1">
                                {listItems}
                            </ul>
                        );
                        inList = false;
                        listItems = [];
                    }

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
            });

            if (inList && listItems.length > 0) {
                renderedElements.push(
                    <ul key={`list-end`} className="my-2 space-y-1">
                        {listItems}
                    </ul>
                );
            }

            return <React.Fragment key={index}>{renderedElements}</React.Fragment>;
        }
    });
}
