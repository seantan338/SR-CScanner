import { cx } from "@/components/ui";

export function Icon({
  name,
  className,
}: {
  name:
    | "library"
    | "scan"
    | "tools"
    | "settings"
    | "search"
    | "plus"
    | "trash"
    | "rotate"
    | "text"
    | "sign"
    | "image"
    | "folder"
    | "tag"
    | "grip"
    | "up"
    | "down"
    | "camera";
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-5 w-5", className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === "library" && (
        <>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </>
      )}
      {name === "scan" && (
        <>
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
          <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
          <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
          <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
          <path d="M4 12h16" />
        </>
      )}
      {name === "tools" && (
        <>
          <path d="M14 7h6" />
          <path d="M4 7h6" />
          <circle cx="12" cy="7" r="2" />
          <path d="M4 17h10" />
          <path d="M18 17h2" />
          <circle cx="16" cy="17" r="2" />
        </>
      )}
      {name === "settings" && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </>
      )}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "trash" && (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M7 7l1 13h8l1-13" />
        </>
      )}
      {name === "rotate" && (
        <>
          <path d="M20 12a8 8 0 1 1-2.3-5.7" />
          <path d="M20 4v5h-5" />
        </>
      )}
      {name === "text" && (
        <>
          <path d="M5 6h14" />
          <path d="M12 6v12" />
          <path d="M8 18h8" />
        </>
      )}
      {name === "sign" && <path d="M4 16c2-4 3-6 4-6s1.5 5 3 5 2-8 3.2-8 2 6 3.3 6 1.2-2 2.5-2" />}
      {name === "image" && (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="m8 15 2.5-3 2 2.5L16 11l3 4" />
          <circle cx="9" cy="9" r="1" />
        </>
      )}
      {name === "folder" && <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />}
      {name === "tag" && (
        <>
          <path d="M20 13.5 12.5 21 3 11.5V4h7.5z" />
          <circle cx="8" cy="8" r="1" />
        </>
      )}
      {name === "grip" && (
        <>
          <circle cx="9" cy="7" r="1" fill="currentColor" />
          <circle cx="15" cy="7" r="1" fill="currentColor" />
          <circle cx="9" cy="12" r="1" fill="currentColor" />
          <circle cx="15" cy="12" r="1" fill="currentColor" />
          <circle cx="9" cy="17" r="1" fill="currentColor" />
          <circle cx="15" cy="17" r="1" fill="currentColor" />
        </>
      )}
      {name === "up" && <path d="m6 14 6-6 6 6" />}
      {name === "down" && <path d="m6 10 6 6 6-6" />}
      {name === "camera" && (
        <>
          <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
          <circle cx="12" cy="13" r="3" />
        </>
      )}
    </svg>
  );
}
