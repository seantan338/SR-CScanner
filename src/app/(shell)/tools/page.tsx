import type { Metadata } from "next";
import { ToolsScreen } from "@/components/tools-screen";

export const metadata: Metadata = { title: "PDF tools" };

export default function ToolsPage() {
  return <ToolsScreen />;
}
