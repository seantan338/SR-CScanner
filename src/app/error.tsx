"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-4xl">Something went wrong</h1>
      <p className="text-ink-soft">{error.message || "The scanner hit an unexpected error."}</p>
      <button type="button" className="h-11 rounded-full bg-teal px-4 font-semibold text-white" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
