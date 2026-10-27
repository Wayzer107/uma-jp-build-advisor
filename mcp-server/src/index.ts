import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBuildView } from "./tools/build-view.js";
import { registerGameImageTools } from "./tools/game-images.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerMaintenanceTools } from "./tools/maintenance.js";
import { registerReferenceTools } from "./tools/reference.js";

const server = new McpServer(
  {
    name: "uma-build-advisor",
    version: "0.4.3",
  },
  {
    instructions: [
      "For every completed or revised six-support build recommendation, call build.present_recommendation before the final answer. The interactive Build View is the required default presentation even when the user does not explicitly request a UI. Do not finish with only a prose deck or table. Missing artwork or unknown ownership does not justify skipping presentation; preserve uncertainty. If the tool actually fails or is absent, explain the specific failure and give the complete text fallback. Pure fact lookups without a build do not require presentation.",
      "Use the explicitly selected server's catalog as the only source for card, trainee, skill, event, factor, race, and course facts.",
      "Never infer ownership from a missing or unavailable private profile. Ask for a GameTora Everything export when inventory is unknown.",
      "Start with the compact reference.get_manifest and inventory.get_summary. Use inventory.query_records to inspect relevant owned supports, trainees, and veteran factors/skills; fetch full veteran details only when needed. Read related catalog facts together with reference.get_records in bounded batches. Follow continuation metadata rather than treating partial pages as complete. inventory.get_profile remains available for compatible callers.",
      "Check current server-specific strategy sources before giving build advice. Prefer reasoned community guides and Japanese community discussion for Japan; treat social posts as anecdotal and cross-check mechanics against the catalog. Use commercial guide sites only when independently corroborated.",
      "Complete every build by calling build.present_recommendation with six support slots, trainee, legacy candidates, alternatives, priorities, assumptions, confidence, and dated evidence links.",
      "The presentation result includes exact Japanese support portraits and trainee artwork in component-only metadata, so the Build View normally needs no extra tool calls. The app-only build.get_game_images tool is a bounded batch fallback for omitted artwork. The configured assetRoot must contain the reviewed local image derivatives and manifest on this MCP host; missing or unresolved art remains a placeholder. Global art is unavailable unless independently verified assets are installed; never substitute Japanese images.",
      "Connect this private MCP server through OpenAI Secure MCP Tunnel for ChatGPT. Local stdio without a tunnel is not available in ChatGPT Web. The host running the MCP process and tunnel client must stay online while ChatGPT uses the tools. The Build View uses the standard MCP Apps UI bridge and responsive layout; keep the text response complete for hosts that do not render the component.",
      "Use official OpenAI plugin developer documentation and direct checks in the target ChatGPT clients when assessing mobile behavior. Keep the Build View responsive and the text answer complete; verify plugin connection, MCP tool invocation, and UI rendering separately in web and native mobile before claiming each works. A read-only GPT Actions API is a separate optional text-only integration, not the mobile fallback by default.",
    ].join(" "),
  },
);

registerReferenceTools(server);
registerInventoryTools(server);
registerMaintenanceTools(server);
registerGameImageTools(server);
registerBuildView(server);

const transport = new StdioServerTransport();
await server.connect(transport);
