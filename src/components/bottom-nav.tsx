"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/", label: "Library", icon: "library" as const, match: (path: string) => path === "/" || path.startsWith("/doc") },
  { href: "/scan", label: "Scan", icon: "scan" as const, match: (path: string) => path.startsWith("/scan") },
  { href: "/tools", label: "Tools", icon: "tools" as const, match: (path: string) => path.startsWith("/tools") },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper-2/95 backdrop-blur lg:inset-y-0 lg:right-auto lg:w-24 lg:border-r lg:border-t-0"
    >
      <ul className="mx-auto flex max-w-lg items-end justify-around px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:h-full lg:max-w-none lg:flex-col lg:justify-center lg:gap-4 lg:px-2 lg:py-6">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const scan = item.href === "/scan";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cx(
                  "flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal",
                  active ? "text-teal" : "text-ink-soft",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cx(
                    "grid place-items-center rounded-full",
                    scan ? "h-14 w-14 -mt-6 bg-teal text-white shadow-lg lg:mt-0" : "h-9 w-9",
                    active && !scan && "bg-teal-soft",
                  )}
                >
                  <Icon name={item.icon} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
