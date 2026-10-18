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
  const deck = value.deck.map((slot, index) => {
    const ownership = slot.owned === null ? "ownership unknown" : slot.owned ? `owned, ${slot.limit_break ?? "LB unknown"} LB` : `rental${slot.borrowed_from ? ` from ${slot.borrowed_from}` : ""}`;
    return `${index + 1}. ${slot.name} — ${slot.role}; ${ownership}. ${slot.reason}`;
  }).join("\n");
  const sources = value.sources.map((source) => `- ${source.title}: ${source.url} (${source.context}; ${source.confidence_note})`).join("\n");
  return [
    `Server: ${value.server} | Scenario: ${value.scenario} | Target: ${value.target}`,
    `Trainee: ${value.trainee.name} — ${value.trainee.reason}`,
    "Six support slots:",
    deck,
    `Legacy options: ${value.legacy_candidates.map((legacy) => legacy.name).join(", ") || "none supplied"}`,
    `Stat priorities: ${value.stat_priorities.map((item) => `${item.name}${item.target ? ` (${item.target})` : ""}: ${item.reason}`).join("; ")}`,
    `Skill priorities: ${value.skill_priorities.map((item) => `${item.name}: ${item.reason}`).join("; ")}`,
    `Confidence: ${value.confidence.level} — ${value.confidence.explanation}`,
    `Evidence checked: ${value.evidence_checked_at}`,
    "Sources:",
    sources,
  ].join("\n");
}
