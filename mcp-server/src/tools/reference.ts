import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { compactManifest, getRecord, recordKinds, readManifest, searchRecords, type RecordKind, type Server } from "../repositories/catalog-reader.js";
import { boundedPage } from "./response-budget.js";

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
}

export function registerReferenceTools(server: McpServer): void {
  server.registerTool(
    "reference.get_manifest",
    {
      title: "Get server catalog manifest",
      description: "Read the selected server's compact catalog status, source hashes, counts, provenance, field coverage, and known unavailable fields. Omits only the internal generated-file list; the full manifest remains in the repository for maintenance. Never substitutes data from the other server.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ server: z.enum(["ja", "global"]) }),
    },
    async ({ server: selectedServer }) => {
      try {
        const { config, warnings } = await loadConfig();
        const manifest = await readManifest(config, selectedServer as Server);
        return reply({ server: selectedServer, manifest: compactManifest(manifest), setup_warnings: warnings });
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
        const records = await searchRecords(config, selectedServer as Server, kind, query, limit, manifest);
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

  server.registerTool(
    "reference.get_records",
    {
      title: "Read a bounded batch of catalog records",
      description: "Read up to 20 exact catalog records for one explicitly selected server in one call, such as a trainee, scenario, and six supports. Returns each requested kind/ID, availability status, and complete record in request order. Missing records remain explicit. The response is byte-bounded; if pagination.complete is false, call again with the original records array sliced from pagination.next_index. Never treat a partial batch as all requested records.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        server: z.enum(["ja", "global"]),
        records: z.array(z.object({ kind: z.enum(recordKinds() as [RecordKind, ...RecordKind[]]), id: z.string().regex(/^\d+$/) })).min(1).max(20),
      }),
    },
    async ({ server: selectedServer, records: requests }) => {
      try {
        const { config } = await loadConfig();
        const manifest = await readManifest(config, selectedServer);
        const results: { kind: RecordKind; id: string; status: string; record: Awaited<ReturnType<typeof getRecord>> }[] = [];
        for (let start = 0; start < requests.length; start += 8) {
          results.push(...await Promise.all(requests.slice(start, start + 8).map(async ({ kind, id }) => {
            const record = manifest.coverage_status === "source_unavailable" ? null : await getRecord(config, selectedServer, kind, id);
            return { kind, id, status: record ? "available" : manifest.coverage_status === "source_unavailable" ? "source_unavailable" : "not_found", record };
          })));
        }
        return reply(boundedPage(results, (records) => ({
          server: selectedServer,
          catalog_status: manifest.coverage_status,
          catalog_generated_at_utc: manifest.generated_at_utc,
          records,
          pagination: {
            requested: requests.length,
            returned: records.length,
            next_index: records.length < requests.length ? records.length : null,
            complete: records.length === requests.length,
          },
        })));
      } catch (error) {
        return reply({ server: selectedServer, status: "unavailable", error: String(error) });
      }
    },
  );
}
