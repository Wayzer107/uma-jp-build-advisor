import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertPathWithin, type AdvisorConfig } from "../config.js";
import type { Server } from "./catalog-reader.js";

export type InventoryProfile = {
  schema_version: number;
  server: Server;
  source_format: string;
  imported_at_utc: string;
  source_version: number | string | null;
  supports: unknown[] | null;
  trainees: unknown[] | null;
  veterans: unknown[] | null;
  partial_sections: string[];
  unresolved_ids: unknown[];
  [key: string]: unknown;
};

export type ProfileResult =
  | { status: "available"; server: Server; profile: InventoryProfile }
  | { status: "missing"; server: Server; message: string }
  | { status: "invalid"; server: Server; message: string };

export async function readProfile(config: AdvisorConfig, server: Server): Promise<ProfileResult> {
  const root = assertPathWithin(config.privateRepoRoot, path.join(config.privateRepoRoot, "profiles", server));
  const currentPath = assertPathWithin(root, path.join(root, "current.json"));
  let raw: string;
  try {
    raw = await readFile(currentPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", server, message: `No ${server} inventory profile is stored. Ownership is unknown, not empty.` };
    }
    throw error;
  }
  try {
    const profile = JSON.parse(raw) as InventoryProfile;
    if (profile.server !== server || profile.schema_version !== 1) {
      return { status: "invalid", server, message: `The saved ${server} profile has an unexpected server or schema version.` };
    }
    return { status: "available", server, profile };
  } catch {
    return { status: "invalid", server, message: `The saved ${server} profile is not valid JSON.` };
  }
}
