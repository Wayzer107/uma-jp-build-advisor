import path from "node:path";
import { assertPathWithin, type AdvisorConfig } from "../config.js";
import type { Server } from "./catalog-reader.js";
import { readJsonCached } from "./json-file-cache.js";
import { boundedPage } from "../tools/response-budget.js";

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
  let profile: InventoryProfile;
  try {
    profile = await readJsonCached<InventoryProfile>(currentPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", server, message: `No ${server} inventory profile is stored. Ownership is unknown, not empty.` };
    }
    if (error instanceof SyntaxError) return { status: "invalid", server, message: `The saved ${server} profile is not valid JSON.` };
    throw error;
  }
  try {
    if (profile.server !== server || profile.schema_version !== 1) {
      return { status: "invalid", server, message: `The saved ${server} profile has an unexpected server or schema version.` };
    }
    return { status: "available", server, profile };
  } catch {
    return { status: "invalid", server, message: `The saved ${server} profile is not valid JSON.` };
  }
}

const projections = new WeakMap<InventoryProfile, InventoryProfile>();

export function compactProfile(profile: InventoryProfile): InventoryProfile {
  const cached = projections.get(profile);
  if (cached) return cached;
  const { source_unknown_fields, unknown_server_fields, raw_source_reference, ...fields } = profile;
  const compact = (entry: unknown): unknown => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const { raw_value, ...normalized } = entry as Record<string, unknown>;
    return normalized;
  };
  const value = {
    ...fields,
    supports: profile.supports?.map(compact) ?? null,
    trainees: profile.trainees?.map(compact) ?? null,
    veterans: profile.veterans?.map(compact) ?? null,
  } as InventoryProfile;
  projections.set(profile, value);
  return value;
}

/** Project the stored profile into a bounded MCP reply without changing its source. */
export async function readMcpProfile(
  config: AdvisorConfig,
  server: Server,
  options: { veteranOffset?: number; veteranLimit?: number } = {},
) {
  const result = await readProfile(config, server);
  if (result.status !== "available") return result;
  const profile = compactProfile(result.profile);
  const offset = options.veteranOffset ?? 0;
  const limit = options.veteranLimit ?? 25;
  const allVeterans = profile.veterans;
  try {
    return boundedPage(allVeterans?.slice(offset, offset + limit) ?? [], (veterans) => ({
      status: "available" as const,
      server,
      profile_projection: "compact_v1",
      profile: {
        ...profile,
        veterans: allVeterans === null ? null : veterans,
      },
      raw_fields_omitted: ["raw_value", "source_unknown_fields", "unknown_server_fields", "raw_source_reference"],
      pagination: {
        veterans: {
          offset,
          requested_limit: limit,
          total: allVeterans?.length ?? null,
          returned: veterans.length,
          next_offset: allVeterans && offset + veterans.length < allVeterans.length ? offset + veterans.length : null,
          complete: allVeterans !== null && offset + veterans.length >= allVeterans.length,
        },
      },
    }));
  } catch (error) {
    return { status: "unavailable" as const, server, message: String(error) };
  }
}
