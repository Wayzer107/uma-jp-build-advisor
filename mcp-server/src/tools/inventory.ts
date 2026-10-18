import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertPathWithin, getStateRoot, loadConfig } from "../config.js";
import { readProfile } from "../repositories/profile-reader.js";
import type { Server } from "../repositories/catalog-reader.js";

const execFile = promisify(execFileCallback);
const IMPORT_MAX_BYTES = 8 * 1024 * 1024;

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
}

function parseCliJson(output: string, operation: string): Record<string, any> {
  try {
    return JSON.parse(output) as Record<string, any>;
  } catch {
    throw new Error(`${operation} returned an unreadable summary`);
  }
}

async function runPython(config: { pythonPath: string; publicRepoRoot: string }, scriptName: string, args: string[]): Promise<Record<string, any>> {
  const scriptPath = assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, "scripts", scriptName));
  const { stdout } = await execFile(config.pythonPath, [scriptPath, ...args], {
    cwd: config.publicRepoRoot,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    encoding: "utf8",
  });
  return parseCliJson(stdout, scriptName);
}

function profileCandidatePath(server: Server, profileId: string): string {
  if (!new RegExp(`^${server}-[a-z0-9-]{8,60}$`).test(profileId)) throw new Error("Invalid profile candidate ID");
  return assertPathWithin(path.join(getStateRoot(), "imports", server), path.join(getStateRoot(), "imports", server, `${profileId}.json`));
}

export function registerInventoryTools(server: McpServer): void {
  server.registerTool(
    "inventory.get_profile",
    {
      title: "Read private inventory profile",
      description: "Read only the selected server's current profile from the configured private repository. A missing profile is reported as unknown ownership, never as an empty collection.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ server: z.enum(["ja", "global"]) }),
    },
    async ({ server: selectedServer }) => {
      try {
        const { config } = await loadConfig();
        const profile = await readProfile(config, selectedServer as Server);
        return reply(profile);
      } catch (error) {
        return reply({ server: selectedServer, status: "unavailable", error: String(error) });
      }
    },
  );

  server.registerTool(
    "inventory.import_gametora",
    {
      title: "Import GameTora Everything JSON",
      description: "Parse a GameTora Everything collection export for one explicitly selected server, preserve the original JSON in local app data, normalize exact catalog IDs, and create a private candidate profile. Does not sync unless the local config explicitly enables autoSyncInventory.",
      annotations: { readOnlyHint: false },
      inputSchema: z.object({
        server: z.enum(["ja", "global"]),
        payload_json: z.string().min(2).max(IMPORT_MAX_BYTES),
      }),
    },
    async ({ server: selectedServer, payload_json }) => {
      try {
        if (Buffer.byteLength(payload_json, "utf8") > IMPORT_MAX_BYTES) throw new Error("Export exceeds the 8 MiB import limit");
        JSON.parse(payload_json);
        const { config } = await loadConfig();
        const chosenServer = selectedServer as Server;
        const candidateId = `${chosenServer}-${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
        const importDir = assertPathWithin(getStateRoot(), path.join(getStateRoot(), "imports", chosenServer));
        await mkdir(importDir, { recursive: true });
        const inputPath = assertPathWithin(importDir, path.join(importDir, `${candidateId}.input.json`));
        const outputPath = profileCandidatePath(chosenServer, candidateId);
        await writeFile(inputPath, payload_json, "utf8");
        let summary: Record<string, any>;
        try {
          summary = await runPython(config, "import_gametora.py", [
            "--server", chosenServer,
            "--input", inputPath,
            "--catalog-root", path.join(config.publicRepoRoot, "data", chosenServer),
            "--output", outputPath,
          ]);
        } finally {
          await unlink(inputPath).catch(() => undefined);
        }
        let sync: Record<string, any> | null = null;
        if (config.autoSyncInventory) {
          sync = await runPython(config, "sync_inventory.py", [
            "--server", chosenServer,
            "--profile", outputPath,
            "--private-repo", config.privateRepoRoot,
          ]);
        }
        return reply({
          status: "imported_candidate",
          profile_id: candidateId,
          server: chosenServer,
          source_server_key: summary.source_server_key,
          source_version: summary.source_version,
          supports: summary.supports,
          trainees: summary.trainees,
          veterans: summary.veterans,
          partial_sections: summary.partial_sections,
          unresolved_ids: summary.unresolved_ids,
          warnings: summary.warnings,
          auto_sync_enabled: config.autoSyncInventory,
          sync,
        });
      } catch (error) {
        return reply({ server: selectedServer, status: "rejected", error: String(error) });
      }
    },
  );

  server.registerTool(
    "inventory.sync_profile",
    {
      title: "Sync an inventory candidate privately",
      description: "Commit a reviewed local candidate profile, its raw GameTora export, and history only to the configured private inventory repository. The sync script verifies the private origin and refuses divergent updates.",
      annotations: { readOnlyHint: false },
      inputSchema: z.object({ server: z.enum(["ja", "global"]), profile_id: z.string().min(10).max(80) }),
    },
    async ({ server: selectedServer, profile_id }) => {
      try {
        const { config } = await loadConfig();
        const chosenServer = selectedServer as Server;
        const profilePath = profileCandidatePath(chosenServer, profile_id);
        await readFile(profilePath, "utf8");
        const result = await runPython(config, "sync_inventory.py", [
          "--server", chosenServer,
          "--profile", profilePath,
          "--private-repo", config.privateRepoRoot,
        ]);
        return reply({ status: result.push_error ? "local_snapshot_retained_push_failed" : "synced", ...result });
      } catch (error) {
        return reply({ server: selectedServer, profile_id, status: "sync_failed", error: String(error) });
      }
    },
  );
}
