import { Suspense } from "react";
import type { Metadata } from "next";
import { ScanFlow } from "@/components/scan-flow";
import { BootScreen } from "@/components/ui";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return (
    <Suspense fallback={<BootScreen label="Opening the camera" />}>
      <ScanFlow />
    </Suspense>
  );
}
