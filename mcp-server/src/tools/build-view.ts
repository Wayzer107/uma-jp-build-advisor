import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { BuildRecommendationSchema, recommendationText, type BuildRecommendation } from "../types/recommendation.js";

const BUILD_VIEW_URI = "ui://uma-build-advisor/build-view.html";

export function registerBuildView(server: McpServer): void {
  registerAppResource(
    server,
    "Umamusume build recommendation view",
    BUILD_VIEW_URI,
    {},
    async () => ({
      contents: [{
        uri: BUILD_VIEW_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(fileURLToPath(new URL("./ui/index.html", import.meta.url)), "utf8"),
      }],
    }),
  );

  registerAppTool(
    server,
    "build.present_recommendation",
    {
      title: "Present a build recommendation",
      description: "Present a complete, evidence-linked Umamusume build in the embedded view and return a text summary. Before calling, read the selected server catalog and inventory, then check current strategy sources for that server. Include exactly six support slots, owned/rental/unknown states, legacy options, substitutions, priorities, assumptions, confidence, and dated sources.",
      annotations: { readOnlyHint: true },
      inputSchema: BuildRecommendationSchema,
      _meta: { ui: { resourceUri: BUILD_VIEW_URI } },
    },
    async (recommendation: BuildRecommendation) => ({
      content: [{ type: "text", text: recommendationText(recommendation) }],
      structuredContent: recommendation,
    }),
  );
}
