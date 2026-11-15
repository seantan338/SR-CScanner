import { zipSync } from "fflate";

export function zipNamedFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const file of files) {
    let name = file.name.trim() || "page.jpg";
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const extension = dot > 0 ? name.slice(dot) : "";
      let index = 2;
      while (used.has(`${stem}-${index}${extension}`)) index += 1;
      name = `${stem}-${index}${extension}`;
    }
    used.add(name);
    input[name] = file.data;
  }
  return zipSync(input, { level: 6 });
}

export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type });
}
