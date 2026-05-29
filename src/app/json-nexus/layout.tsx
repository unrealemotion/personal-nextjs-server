import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JSON Nexus - Grid Flat & Diff",
  description: "Advanced utility to compare JSON structures and flatten nested objects or lists recursively.",
};

export default function JSONNexusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
