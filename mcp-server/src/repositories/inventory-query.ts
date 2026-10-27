import type { AdvisorConfig } from "../config.js";
import type { Server } from "./catalog-reader.js";
import { compactProfile, readProfile } from "./profile-reader.js";
import { boundedPage } from "../tools/response-budget.js";

export type ProfileSection = "supports" | "trainees" | "veterans";
export type InventoryQuery = {
  section: ProfileSection;
  ids?: string[];
  query?: string;
  minimum_limit_break?: number;
  trainee_outfit_id?: string;
  skill_id?: string;
  factor_id?: string;
  offset?: number;
  limit?: number;
  detail?: "summary" | "full";
};

export async function readInventorySummary(config: AdvisorConfig, server: Server) {
  const result = await readProfile(config, server);
  if (result.status !== "available") return result;
  const profile = result.profile;
  return {
    status: "available" as const,
    server,
    imported_at_utc: profile.imported_at_utc,
    source_format: profile.source_format,
    partial_sections: profile.partial_sections,
    sections: Object.fromEntries((["supports", "trainees", "veterans"] as const).map((section) => [section, {
      status: profile[section] == null ? "unknown" : "available",
      count: profile[section]?.length ?? null,
    }])),
    unresolved_id_count: profile.unresolved_ids.length,
  };
}

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim();

function hasSkill(value: unknown, id: string): boolean {
  return Array.isArray(value) && value.some((item) => String(item && typeof item === "object" ? item.skill_id : item) === id);
}

function hasFactor(value: unknown, id: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).some((group) => Array.isArray(group) && group.some((item) => item && typeof item === "object" && String(item.factor_id) === id));
}

export async function queryInventory(config: AdvisorConfig, server: Server, options: InventoryQuery) {
  if (options.minimum_limit_break !== undefined && options.section !== "supports") throw new Error("minimum_limit_break applies only to supports.");
  if ((options.skill_id || options.factor_id) && options.section !== "veterans") throw new Error("skill_id and factor_id filter exact stored veteran identifiers only.");
  if (options.trainee_outfit_id && options.section === "supports") throw new Error("trainee_outfit_id applies only to trainees or veterans.");
  const result = await readProfile(config, server);
  if (result.status !== "available") return result;
  const profile = compactProfile(result.profile);
  const section = profile[options.section];
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 20;
  const detail = options.detail ?? "summary";
  const ids = options.ids ? new Set(options.ids) : null;
  const query = options.query ? normalize(options.query) : null;
  const idField = { supports: "support_id", trainees: "trainee_outfit_id", veterans: "veteran_id" }[options.section];
  const matching = section?.filter((value) => {
    const item = value as Record<string, any>;
    if (ids && !ids.has(String(item[idField]))) return false;
    if (query && !normalize(String(item.catalog_match?.name ?? "")).includes(query)) return false;
    if (options.minimum_limit_break !== undefined && (typeof item.limit_break !== "number" || item.limit_break < options.minimum_limit_break)) return false;
    if (options.trainee_outfit_id && String(item.trainee_outfit_id) !== options.trainee_outfit_id) return false;
    if (options.skill_id && !hasSkill(item.skills, options.skill_id)) return false;
    if (options.factor_id && !hasFactor(item.factors, options.factor_id)) return false;
    return true;
  }) ?? null;
  const selected = matching?.slice(offset, offset + limit).map((value) => {
    if (options.section !== "veterans" || detail === "full") return value;
    const item = value as Record<string, unknown>;
    return Object.fromEntries(["veteran_id", "card_tid", "trainee_outfit_id", "score", "stats", "aptitudes", "skills", "factors", "catalog_match"].map((key) => [key, item[key]]));
  }) ?? [];
  return boundedPage(selected, (page) => ({
    status: "available" as const,
    server,
    section: options.section,
    section_status: section === null ? "unknown" : "available",
    imported_at_utc: profile.imported_at_utc,
    partial_sections: profile.partial_sections,
    detail,
    records: section === null ? null : page,
    pagination: {
      offset,
      requested_limit: limit,
      total: matching?.length ?? null,
      returned: page.length,
      next_offset: matching && offset + page.length < matching.length ? offset + page.length : null,
      complete: matching !== null && offset + page.length >= matching.length,
    },
  }));
}
