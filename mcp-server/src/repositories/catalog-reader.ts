import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertPathWithin, type AdvisorConfig } from "../config.js";

export type Server = "ja" | "global";
export type RecordKind = "support_card" | "trainee_outfit" | "skill" | "training_event" | "scenario" | "race" | "race_course" | "race_condition" | "inheritance_factor";

export type CatalogManifest = {
  schema_version: number;
  server: Server;
  generated_at_utc: string | null;
  coverage_status: "complete" | "incomplete" | "source_unavailable";
  counts?: Record<string, number>;
  source?: Record<string, unknown>;
  gametora_reconciliation?: Record<string, unknown>;
  unavailable_fields?: unknown[];
  [key: string]: unknown;
};

const ENTITY_LAYOUT: Record<RecordKind, { entity: string; folder: string }> = {
  support_card: { entity: "support_cards", folder: "support-cards" },
  trainee_outfit: { entity: "trainee_outfits", folder: "trainees" },
  skill: { entity: "skills", folder: "skills" },
  training_event: { entity: "events", folder: "events" },
  scenario: { entity: "scenarios", folder: "scenarios" },
  race: { entity: "races", folder: "races" },
  race_course: { entity: "race_courses", folder: "races/courses" },
  race_condition: { entity: "race_conditions", folder: "races/conditions" },
  inheritance_factor: { entity: "factors", folder: "factors" },
};

export type CatalogRecord = Record<string, any> & {
  id: number | string;
  kind: string;
  server: Server;
  source: Record<string, unknown>;
};

export type RecordSummary = {
  id: string;
  kind: RecordKind;
  server: Server;
  name: string | null;
  name_text?: unknown;
  title_text?: unknown;
  gametora?: unknown;
  record_path: string;
  match_type: "id" | "name";
};

export function catalogRoot(config: AdvisorConfig, server: Server): string {
  return assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, "data", server));
}

export async function readManifest(config: AdvisorConfig, server: Server): Promise<CatalogManifest> {
  const root = catalogRoot(config, server);
  const manifest = JSON.parse(await readFile(assertPathWithin(root, path.join(root, "manifest.json")), "utf8")) as CatalogManifest;
  if (manifest.server !== server) throw new Error(`Catalog server mismatch: expected ${server}, found ${manifest.server}`);
  return manifest;
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export async function getRecord(config: AdvisorConfig, server: Server, kind: RecordKind, id: string): Promise<CatalogRecord | null> {
  if (!/^\d+$/.test(id)) return null;
  const root = catalogRoot(config, server);
  const layout = ENTITY_LAYOUT[kind];
  const recordPath = assertPathWithin(root, path.join(root, layout.folder, `${id}.json`));
  try {
    const record = JSON.parse(await readFile(recordPath, "utf8")) as CatalogRecord;
    if (record.server !== server || String(record.id) !== id) return null;
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function searchRecords(
  config: AdvisorConfig,
  server: Server,
  kind: RecordKind,
  query: string,
  limit = 20,
): Promise<RecordSummary[]> {
  const manifest = await readManifest(config, server);
  if (manifest.coverage_status === "source_unavailable") return [];
  const root = catalogRoot(config, server);
  const layout = ENTITY_LAYOUT[kind];
  const indexPath = assertPathWithin(root, path.join(root, "indexes", `${layout.entity}.json`));
  const index = JSON.parse(await readFile(indexPath, "utf8")) as { by_id: Record<string, string>; by_name: Record<string, string[]> };
  const normalized = normalizeName(query);
  if (!normalized) return [];

  const ids = new Map<string, "id" | "name">();
  if (/^\d+$/.test(query.trim()) && index.by_id[query.trim()]) ids.set(query.trim(), "id");
  for (const [name, matchingIds] of Object.entries(index.by_name)) {
    if (name === normalized) {
      for (const id of matchingIds) ids.set(id, "name");
    }
  }
  if (ids.size === 0 && normalized.length >= 2) {
    for (const [name, matchingIds] of Object.entries(index.by_name)) {
      if (name.includes(normalized)) {
        for (const id of matchingIds) ids.set(id, "name");
        if (ids.size >= Math.min(limit * 4, 200)) break;
      }
    }
  }

  const summaries: RecordSummary[] = [];
  for (const [id, matchType] of [...ids.entries()].slice(0, Math.max(1, Math.min(limit, 50)))) {
    const record = await getRecord(config, server, kind, id);
    if (!record) continue;
    summaries.push({
      id,
      kind,
      server,
      name: typeof record.name === "string" ? record.name : null,
      name_text: record.name_text,
      title_text: record.title_text,
      gametora: record.gametora,
      record_path: `${layout.folder}/${id}.json`,
      match_type: matchType,
    });
  }
  return summaries;
}

export function recordKinds(): RecordKind[] {
  return Object.keys(ENTITY_LAYOUT) as RecordKind[];
}
