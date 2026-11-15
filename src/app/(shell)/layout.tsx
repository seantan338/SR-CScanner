import { Suspense } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineNote } from "@/components/pwa-register";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-24">
      <OfflineNote />
      {children}
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
