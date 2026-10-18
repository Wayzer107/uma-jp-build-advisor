import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { getRecord, recordKinds, readManifest, searchRecords, type RecordKind, type Server } from "../repositories/catalog-reader.js";

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
}

export function registerReferenceTools(server: McpServer): void {
  server.registerTool(
    "reference.get_manifest",
    {
      title: "Get server catalog manifest",
      description: "Read the selected server's catalog status, source hashes, counts, provenance, and known unavailable fields from the configured public reference repository. Never substitutes data from the other server.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ server: z.enum(["ja", "global"]) }),
    },
    async ({ server: selectedServer }) => {
      try {
        const { config, warnings } = await loadConfig();
        const manifest = await readManifest(config, selectedServer as Server);
        return reply({ server: selectedServer, manifest, setup_warnings: warnings });
      } catch (error) {
        return reply({ server: selectedServer, status: "unavailable", error: String(error) });
      }
    },
  );

  server.registerTool(
    "reference.search_records",
    {
      title: "Search the reference catalog",
      description: `Search addressable records using exact IDs or normalized Japanese/English names. Supported kinds: ${recordKinds().join(", ")}. Returns only records from the explicitly selected server.`,
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        server: z.enum(["ja", "global"]),
        kind: z.enum(recordKinds() as [RecordKind, ...RecordKind[]]),
        query: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async ({ server: selectedServer, kind, query, limit }) => {
      try {
        const { config } = await loadConfig();
        const manifest = await readManifest(config, selectedServer as Server);
        const records = await searchRecords(config, selectedServer as Server, kind, query, limit);
        return reply({
          server: selectedServer,
          catalog_status: manifest.coverage_status,
          catalog_generated_at_utc: manifest.generated_at_utc,
          source: manifest.source,
          records,
          match_count: records.length,
        });
      } catch (error) {
        return reply({ server: selectedServer, kind, status: "unavailable", error: String(error), records: [] });
      }
    },
  );

  server.registerTool(
    "reference.get_record",
    {
      title: "Get a catalog record",
      description: "Fetch one complete support, trainee, skill, event, scenario, race/course/condition, or inheritance record by its exact catalog ID. Includes Japanese/available English text, raw and normalized data, provenance, and GameTora mapping where present.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ server: z.enum(["ja", "global"]), kind: z.enum(recordKinds() as [RecordKind, ...RecordKind[]]), id: z.string().regex(/^\d+$/) }),
    },
    async ({ server: selectedServer, kind, id }) => {
      try {
        const { config } = await loadConfig();
        const manifest = await readManifest(config, selectedServer as Server);
        const record = await getRecord(config, selectedServer as Server, kind, id);
        return reply({
          server: selectedServer,
          catalog_status: manifest.coverage_status,
          catalog_generated_at_utc: manifest.generated_at_utc,
          record: record || null,
          status: record ? "available" : manifest.coverage_status === "source_unavailable" ? "source_unavailable" : "not_found",
        });
      } catch (error) {
        return reply({ server: selectedServer, kind, id, status: "unavailable", error: String(error) });
      }
    },
  );
}
