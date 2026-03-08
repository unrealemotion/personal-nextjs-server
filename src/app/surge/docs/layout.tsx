import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Surge API – Documentation",
    description:
        "Step-by-step guide for using the Surge API orchestrator. Upload data, design requests, chain steps, and export results.",
};

export default function DocsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
