import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { BuildRecommendationSchema, recommendationText, type BuildRecommendation } from "../types/recommendation.js";

import { loadGameImages, type ImageRequest } from "./game-images.js";
import { MCP_REPLY_BUDGET } from "./response-budget.js";

const BUILD_VIEW_URI = "ui://uma-build-advisor/build-view-v0.4.3.html";
// Existing ChatGPT connections may retain a previous tool descriptor. Keep
// those resource addresses readable rather than breaking presentation.
const BUILD_VIEW_ALIASES = [
  "ui://uma-build-advisor/build-view.html",
  "ui://uma-build-advisor/build-view-v0.4.1.html",
  "ui://uma-build-advisor/build-view-v0.4.2.html",
];

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
      ];
      const artwork = await loadGameImages(requests, 0, budget);
      return { ...response, _meta: { artwork } };
    },
  );
}
