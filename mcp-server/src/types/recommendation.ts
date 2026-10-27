import { z } from "zod";

const LinkedItem = z.object({
  id: z.string(),
  name: z.string(),
  gametora_url: z.string().url().nullable().optional(),
  reason: z.string(),
});

export const BuildRecommendationSchema = z.object({
  server: z.enum(["ja", "global"]),
  scenario: z.string(),
  target: z.string(),
  generated_at: z.string().datetime(),
  evidence_checked_at: z.string().datetime(),
  trainee: LinkedItem,
  deck: z.array(z.object({
    support_id: z.string(),
    name: z.string(),
    gametora_url: z.string().url().nullable(),
    owned: z.boolean().nullable(),
    limit_break: z.number().int().min(0).max(4).nullable(),
    effective_level: z.number().int().min(1).nullable(),
    role: z.string(),
    reason: z.string(),
    effects: z.array(z.string()),
    skills: z.array(z.string()),
    borrowed_from: z.string().nullable().optional(),
  })).length(6),
  legacy_candidates: z.array(z.object({
    id: z.string().nullable(),
    name: z.string(),
    gametora_url: z.string().url().nullable(),
    reason: z.string(),
    factors: z.array(z.string()),
    skills: z.array(z.string()),
    owned: z.boolean().nullable(),
  })),
  stat_priorities: z.array(z.object({ name: z.string(), target: z.string().nullable().optional(), reason: z.string() })),
  skill_priorities: z.array(z.object({ name: z.string(), target: z.string().nullable().optional(), reason: z.string() })),
  alternatives: z.array(z.object({ label: z.string(), changes: z.string(), tradeoff: z.string() })),
  assumptions: z.array(z.string()),
  confidence: z.object({ level: z.enum(["high", "medium", "low"]), explanation: z.string() }),
  sources: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    source_type: z.enum(["game_data", "official", "community", "inference"]),
    context: z.string(),
    retrieved_at: z.string().datetime(),
    confidence_note: z.string(),
  })),
}).strict();

export type BuildRecommendation = z.infer<typeof BuildRecommendationSchema>;

export function recommendationText(value: BuildRecommendation): string {
  const ownership = (owned: boolean | null) => owned === null ? "ownership unknown" : owned ? "owned" : "not owned";
  const priorities = (items: BuildRecommendation["stat_priorities"]) => items.map((item) => `${item.name}${item.target ? ` (${item.target})` : ""}: ${item.reason}`).join("; ") || "none supplied";
  const deck = value.deck.map((slot, index) => {
    const status = slot.owned === false ? `rental${slot.borrowed_from ? ` from ${slot.borrowed_from}` : ""}` : ownership(slot.owned);
    return [
      `${index + 1}. ${slot.name} (ID ${slot.support_id}) — ${slot.role}; ${status}; ${slot.limit_break === null ? "LB unknown" : `LB${slot.limit_break}`}; ${slot.effective_level === null ? "level unknown" : `level ${slot.effective_level}`}. ${slot.reason}`,
      slot.effects.length ? `   Effects: ${slot.effects.join("; ")}` : "",
      slot.skills.length ? `   Skills: ${slot.skills.join("; ")}` : "",
      slot.gametora_url ? `   Card: ${slot.gametora_url}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n");
  const legacies = value.legacy_candidates.map((legacy) => [
    `- ${legacy.name}${legacy.id ? ` (ID ${legacy.id})` : ""} — ${ownership(legacy.owned)}. ${legacy.reason}`,
    legacy.factors.length ? `  Factors: ${legacy.factors.join("; ")}` : "",
    legacy.skills.length ? `  Skills: ${legacy.skills.join("; ")}` : "",
    legacy.gametora_url ? `  Candidate: ${legacy.gametora_url}` : "",
  ].filter(Boolean).join("\n")).join("\n") || "none supplied";
  const alternatives = value.alternatives.map((item) => `- ${item.label}: ${item.changes} Tradeoff: ${item.tradeoff}`).join("\n") || "none supplied";
  const assumptions = value.assumptions.map((item) => `- ${item}`).join("\n") || "none supplied";
  const sources = value.sources.map((source) => `- [${source.source_type}] ${source.title}: ${source.url} (${source.context}; ${source.confidence_note}; retrieved ${source.retrieved_at})`).join("\n") || "none supplied";
  return [
    `Server: ${value.server} | Scenario: ${value.scenario} | Target: ${value.target}`,
    `Generated: ${value.generated_at}`,
    `Trainee: ${value.trainee.name} (ID ${value.trainee.id}) — ${value.trainee.reason}${value.trainee.gametora_url ? ` ${value.trainee.gametora_url}` : ""}`,
    "Six support slots:",
    deck,
    "Legacy options:",
    legacies,
    `Stat priorities: ${priorities(value.stat_priorities)}`,
    `Skill priorities: ${priorities(value.skill_priorities)}`,
    "Alternatives and tradeoffs:",
    alternatives,
    "Assumptions and gaps:",
    assumptions,
    `Confidence: ${value.confidence.level} — ${value.confidence.explanation}`,
    `Evidence checked: ${value.evidence_checked_at}`,
    "Sources:",
    sources,
  ].join("\n");
}
