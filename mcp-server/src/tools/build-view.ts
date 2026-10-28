import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { getRecord } from "../repositories/catalog-reader.js";
import { BuildRecommendationSchema, recommendationText, type BuildRecommendation } from "../types/recommendation.js";

import { loadGameImages, type ImageRequest } from "./game-images.js";
import { MCP_REPLY_BUDGET } from "./response-budget.js";

const BUILD_VIEW_URI = "ui://uma-build-advisor/build-view-v0.4.4.html";
// Existing ChatGPT connections may retain a previous tool descriptor. Keep
// those resource addresses readable rather than breaking presentation.
const BUILD_VIEW_ALIASES = [
  "ui://uma-build-advisor/build-view.html",
  "ui://uma-build-advisor/build-view-v0.4.1.html",
  "ui://uma-build-advisor/build-view-v0.4.2.html",
  "ui://uma-build-advisor/build-view-v0.4.3.html",
];

const SupportCardArtworkSchema = z.object({
  server: z.literal("ja"),
  cards: z.array(z.object({
    support_id: z.string().regex(/^\d{1,12}$/),
    takeaway: z.string().trim().min(1).max(280),
  }).strict()).min(1).max(2),
}).strict();

const TRAINING_TYPE_ROLES: Array<{ id: string; aliases: string[] }> = [
  { id: "101", aliases: ["speed"] },
  { id: "102", aliases: ["stamina"] },
  { id: "103", aliases: ["power"] },
  { id: "105", aliases: ["guts"] },
  { id: "106", aliases: ["wit", "wisdom", "intelligence"] },
];

function trainingTypeIdForRole(role: string): string | null {
  const normalized = role.trim().toLocaleLowerCase();
  return TRAINING_TYPE_ROLES.find((type) => type.aliases.some((alias) => normalized === alias || normalized.includes(alias)))?.id ?? null;
}

function supportDisplayName(record: Record<string, any> | null, id: string): string {
  if (!record) return `Support card ${id}`;
  const englishSearchName = Array.isArray(record.search_names)
    ? record.search_names.find((name: unknown) => typeof name === "string" && /[a-z]/i.test(name))
    : null;
  return record.name_text?.en || englishSearchName || record.name_text?.ja || `Support card ${id}`;
}

export function registerBuildView(server: McpServer): void {
  for (const uri of [BUILD_VIEW_URI, ...BUILD_VIEW_ALIASES]) registerAppResource(
    server,
    "Umamusume build recommendation view",
    uri,
    {},
    async () => ({
      contents: [{
        uri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(fileURLToPath(new URL("./ui/index.html", import.meta.url)), "utf8"),
        _meta: {
          ui: { csp: { resourceDomains: ["blob:"] } },
          "openai/widgetDescription": "Interactive Umamusume Build View with a trainee portrait, six support-card portraits, ownership, expandable card details, build rationale, dated sources, and Refine build. The tool also returns the complete text recommendation; a brief chat summary can accompany this view.",
        },
      }],
    }),
  );

  registerAppTool(
    server,
    "build.present_recommendation",
    {
      title: "Present a build recommendation",
      description: "Required final step for every completed or revised six-support Umamusume build recommendation: call this tool before the final answer, even when the user has not explicitly requested an interface. Opens the interactive Build View with card images and returns the complete text fallback. First read the selected server catalog/inventory and current strategy sources. Include exactly six support slots, ownership states, legacies, substitutions, priorities, assumptions, confidence, and dated sources. Missing artwork or unknown ownership does not prevent presentation; mark uncertainty honestly. Do not replace this call with a prose-only deck, table, generated image, or custom HTML. Pure catalog lookups without a build do not require this tool.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      inputSchema: BuildRecommendationSchema,
      outputSchema: BuildRecommendationSchema,
      _meta: {
        ui: { resourceUri: BUILD_VIEW_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": BUILD_VIEW_URI,
        "openai/toolInvocation/invoking": "Opening the six-card Build View…",
        "openai/toolInvocation/invoked": "Build recommendation ready",
      },
    },
    async (recommendation: BuildRecommendation) => {
      const response = {
        content: [{ type: "text" as const, text: recommendationText(recommendation) }],
        structuredContent: recommendation,
      };
      // Hydrate the component in the original result: artwork must not require
      // a sequence of host/tunnel calls or enter the model's context.
      const budget = MCP_REPLY_BUDGET - Buffer.byteLength(JSON.stringify(response)) - 256;
      if (budget < 2048) return response;
      const requests: ImageRequest[] = [
        ...recommendation.deck.map((slot): ImageRequest => ({ server: recommendation.server, kind: "support_card", catalog_id: slot.support_id, variant: "portrait" })),
        { server: recommendation.server, kind: "trainee", catalog_id: recommendation.trainee.id, variant: "icon" },
        { server: recommendation.server, kind: "trainee", catalog_id: recommendation.trainee.id, variant: "portrait" },
        ...[...new Set(recommendation.deck.map((slot) => trainingTypeIdForRole(slot.role)).filter((id): id is string => id !== null))]
          .map((catalog_id): ImageRequest => ({ server: recommendation.server, kind: "training_type", catalog_id, variant: "icon" })),
      ];
      const artwork = await loadGameImages(requests, 0, budget);
      return { ...response, _meta: { artwork } };
    },
  );

  registerAppTool(
    server,
    "build.present_support_card_artwork",
    {
      title: "Show Japanese support-card artwork",
      description: "Return the exact installed Japanese in-game artwork for up to two support cards as image content in the chat. Use catalog-confirmed support IDs and explain why each card matters. This tool never uses guide-site screenshots or substitutes images across servers.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      inputSchema: SupportCardArtworkSchema,
      _meta: { ui: { visibility: ["model"] } },
    },
    async ({ cards }: z.infer<typeof SupportCardArtworkSchema>) => {
      const { config } = await loadConfig();
      const records = await Promise.all(cards.map(({ support_id }) => getRecord(config, "ja", "support_card", support_id)));
      const known = cards.flatMap((card, index) => records[index] ? [{ ...card, record: records[index]! }] : []);
      const requests: ImageRequest[] = known.map((card) => ({
        server: "ja",
        kind: "support_card",
        catalog_id: card.support_id,
        variant: "portrait",
      }));
      const payload = requests.length ? await loadGameImages(requests, 0, MCP_REPLY_BUDGET - 12 * 1024) : { assets: [] };
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
        { type: "text", text: "Japanese in-game support-card artwork resolved by exact catalog ID from the installed game cache." },
      ];
      const results = cards.map((card, index) => {
        const record = records[index];
        const label = supportDisplayName(record, card.support_id);
        const image = payload.assets.find((asset) => asset.key === `ja:support_card:${card.support_id}:portrait`);
        content.push({ type: "text", text: `${label} (support ID ${card.support_id}): ${card.takeaway}` });
        if (image?.status === "available" && image.mime_type === "image/webp" && image.data_base64) {
          content.push({ type: "image", data: image.data_base64, mimeType: image.mime_type });
        } else {
          content.push({ type: "text", text: record ? `Installed-game artwork unavailable: ${image?.reason || "the exact portrait is not in this host's verified cache"}` : "The exact support ID is absent from the Japanese catalog; no image was returned." });
        }
        return {
          support_id: card.support_id,
          catalog_record_found: Boolean(record),
          label,
          takeaway: card.takeaway,
          artwork_status: image?.status || (record ? "missing" : "unresolved"),
          reason: image?.reason || (record ? undefined : "Exact ID is absent from the Japanese catalog."),
        };
      });
      return {
        content,
        structuredContent: { server: "ja", source: "installed_japanese_game_cache", cards: results },
      };
    },
  );
}
