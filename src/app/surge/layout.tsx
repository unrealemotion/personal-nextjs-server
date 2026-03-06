import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Unreal's Surge API",
    description: "High-Performance Next-Generation API Orchestrator",
};

export default function SurgeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
