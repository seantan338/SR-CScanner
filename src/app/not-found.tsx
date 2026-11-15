import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-4xl">Page not found</h1>
      <Link href="/" className="font-semibold text-teal">
        Back to the library
      </Link>
    </main>
  );
}
