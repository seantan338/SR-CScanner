import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const VARIANTS = {
  primary: "bg-teal text-white hover:bg-teal/90",
  amber: "bg-amber text-ink hover:bg-amber/90",
  ghost: "border border-line bg-paper-2 text-ink hover:bg-white",
  danger: "bg-transparent text-danger hover:bg-danger/10",
  ink: "bg-ink text-paper-2 hover:bg-ink/90",
} as const;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button className="absolute inset-0 bg-ink/45" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="relative z-10 max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-paper-2 p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="dialog-title" className="font-display text-2xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-paper"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BootScreen({ label = "Opening SR-CScanner" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <p className="font-display text-4xl text-ink">SR-CScanner</p>
        <p className="mt-2 text-sm text-ink-soft">{label}</p>
      </div>
    </div>
  );
}
