import { readFile, stat } from "node:fs/promises";
import path from "node:path";

type Entry = { fingerprint: string; value: unknown; bytes: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, { fingerprint: string; token: object; promise: Promise<unknown> }>();
const MAX_FILES = 256;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
let sourceBytes = 0;

function forget(file: string): void {
  const previous = entries.get(file);
  if (previous) sourceBytes -= previous.bytes;
  entries.delete(file);
}

async function fingerprint(file: string): Promise<string> {
  const info = await stat(file, { bigint: true });
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}

/** Shared, read-only parsed snapshots. Every access checks the source file version. */
export async function readJsonCached<T>(filePath: string): Promise<T> {
  const file = path.resolve(filePath);
  let version: string;
  try {
    version = await fingerprint(file);
  } catch (error) {
    forget(file);
    throw error;
  }
  const cached = entries.get(file);
  if (cached?.fingerprint === version) {
    entries.delete(file);
    entries.set(file, cached);
    return cached.value as T;
  }
  forget(file);
  const loading = pending.get(file);
  if (loading?.fingerprint === version) return loading.promise as Promise<T>;

  const token = {};
  const promise = (async () => {
    let before = version;
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = await readFile(file, "utf8");
      const after = await fingerprint(file);
      if (before !== after) {
        before = after;
        continue;
      }
      const value = JSON.parse(text) as T;
      const bytes = Buffer.byteLength(text);
      // An older overlapping read must not replace a newer cached version.
      if (pending.get(file)?.token === token && bytes <= MAX_SOURCE_BYTES) {
        forget(file);
        entries.set(file, { fingerprint: after, value, bytes });
        sourceBytes += bytes;
        while (entries.size > MAX_FILES || sourceBytes > MAX_SOURCE_BYTES) {
          forget(entries.keys().next().value!);
        }
      }
      return value;
    }
    throw new Error("Source file changed repeatedly while reading; retry the request.");
  })();
  pending.set(file, { fingerprint: version, token, promise });
  try {
    return await promise;
  } finally {
    if (pending.get(file)?.token === token) pending.delete(file);
  }
}
