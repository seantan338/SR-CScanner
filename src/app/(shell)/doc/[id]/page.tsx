import { Suspense } from "react";
import type { Metadata } from "next";
import { DocumentScreen } from "@/components/document-screen";
import { BootScreen } from "@/components/ui";

export const metadata: Metadata = { title: "Document" };

export default function DocumentPage() {
  return (
    <Suspense fallback={<BootScreen label="Opening document" />}>
      <DocumentScreen />
    </Suspense>
  );
}
