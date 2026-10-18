import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBuildView } from "./tools/build-view.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerMaintenanceTools } from "./tools/maintenance.js";
import { registerReferenceTools } from "./tools/reference.js";

const server = new McpServer(
  {
    name: "uma-build-advisor",
    version: "0.2.0",
  },
  {
    instructions: [
      "Use the explicitly selected server's catalog as the only source for card, trainee, skill, event, factor, race, and course facts.",
      "Never infer ownership from a missing or unavailable private profile. Ask for a GameTora Everything export when inventory is unknown.",
      "Check current server-specific strategy sources before giving build advice. Prefer reasoned community guides and Japanese community discussion for Japan; treat social posts as anecdotal and cross-check mechanics against the catalog. Use commercial guide sites only when independently corroborated.",
      "When presenting a recommendation, use build.present_recommendation and include six support slots, trainee, legacy candidates, alternatives, priorities, assumptions, confidence, and dated evidence links.",
      "For ChatGPT web chat, connect this private MCP server through OpenAI Secure MCP Tunnel. Local stdio without a tunnel is not available in ChatGPT web. The host running the MCP process and tunnel client must stay online while ChatGPT uses the tools. ChatGPT custom MCP access is web-only and depends on account and workspace permissions; do not claim mobile support.",
    ].join(" "),
  },
);

registerReferenceTools(server);
registerInventoryTools(server);
registerMaintenanceTools(server);
registerBuildView(server);

const transport = new StdioServerTransport();
await server.connect(transport);
