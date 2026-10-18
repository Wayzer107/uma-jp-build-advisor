import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertPathWithin, getStateRoot, loadConfig } from "../config.js";
import type { Server } from "../repositories/catalog-reader.js";

const execFile = promisify(execFileCallback);
const PUBLIC_REMOTE = "Wayzer107/uma-jp-build-advisor";

type CliResult = { stdout: string; stderr: string; code: number };

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
}

async function runCli(command: string, args: string[], cwd: string, timeout = 600_000): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      cwd,
      windowsHide: true,
      maxBuffer: 12 * 1024 * 1024,
      timeout,
      encoding: "utf8",
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: String(failure.stdout || ""),
      stderr: String(failure.stderr || failure.message || ""),
      code: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

function parseSummary(output: string, label: string): Record<string, any> {
  try {
    return JSON.parse(output) as Record<string, any>;
  } catch {
    throw new Error(`${label} returned an unreadable summary`);
  }
}

function expectedPublicRemote(value: string): boolean {
  const normalized = value.trim().replace(/\.git$/i, "");
  return [
    `https://github.com/${PUBLIC_REMOTE}`,
    `git@github.com:${PUBLIC_REMOTE}`,
    `ssh://git@github.com/${PUBLIC_REMOTE}`,
  ].some((item) => normalized.toLowerCase() === item.toLowerCase());
}

async function git(config: { publicRepoRoot: string }, args: string[], allowFailure = false): Promise<string> {
  const result = await runCli("git", args, config.publicRepoRoot, 60_000);
  if (result.code && !allowFailure) throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function runValidator(config: { pythonPath: string; publicRepoRoot: string; gameRoot: string }, server: Server, catalogRoot: string): Promise<Record<string, any>> {
  const scriptPath = assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, "scripts", "validate_catalog.py"));
  const result = await runCli(config.pythonPath, [scriptPath, "--server", server, "--catalog-root", catalogRoot, "--game-root", config.gameRoot], config.publicRepoRoot);
  const summary = parseSummary(result.stdout, "Catalog validator");
  if (result.code && summary.coverage_status !== "incomplete") {
    throw new Error(result.stderr.trim() || `Catalog validation failed with exit code ${result.code}`);
  }
  const blocking = (summary.blocking_issues || []) as string[];
  const unexpected = blocking.filter((issue) => !/^Event choice\/reward data unavailable for \d+ event records$/.test(issue));
  if (unexpected.length) throw new Error(`Catalog candidate has blocking issues: ${unexpected.join("; ")}`);
  return summary;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const fs = await import("node:fs/promises");
  await fs.rename(temporary, filePath);
}

async function readCandidate(config: { publicRepoRoot: string }, candidateId: string): Promise<{ server: Server; root: string; metadataPath: string; metadata: Record<string, any> }> {
  if (!/^(ja|global)-[a-f0-9]{8}-\d{10,16}$/.test(candidateId)) throw new Error("Invalid catalog candidate ID");
  const stateCandidates = path.join(getStateRoot(), "catalog-candidates");
  const metadataPath = assertPathWithin(stateCandidates, path.join(stateCandidates, `${candidateId}.json`));
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, any>;
  if (metadata.candidate_id !== candidateId || !["ja", "global"].includes(metadata.server)) throw new Error("Candidate metadata does not match the requested candidate");
  const stagingRoot = assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, ".staging", "catalog-candidates"));
  const root = assertPathWithin(stagingRoot, String(metadata.catalog_root || ""));
  return { server: metadata.server as Server, root, metadataPath, metadata };
}

async function copyGeneratedCatalog(candidateRoot: string, destinationRoot: string): Promise<{ copied: number; removed: number }> {
  const candidateManifest = JSON.parse(await readFile(path.join(candidateRoot, "manifest.json"), "utf8")) as Record<string, any>;
  const destinationManifestPath = path.join(destinationRoot, "manifest.json");
  let previousGenerated: string[] = [];
  try {
    const previous = JSON.parse(await readFile(destinationManifestPath, "utf8")) as Record<string, any>;
    previousGenerated = Array.isArray(previous.generated_files) ? previous.generated_files : [];
  } catch { /* first generated version */ }

  const newGenerated = new Set<string>(Array.isArray(candidateManifest.generated_files) ? candidateManifest.generated_files : []);
  let removed = 0;
  for (const relative of previousGenerated) {
    if (typeof relative !== "string" || newGenerated.has(relative)) continue;
    const stale = assertPathWithin(destinationRoot, path.join(destinationRoot, relative));
    if (stale !== destinationRoot) {
      await unlink(stale).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      removed += 1;
    }
  }

  let copied = 0;
  for (const relative of newGenerated) {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("Manifest contains an unsafe generated path");
    const source = assertPathWithin(candidateRoot, path.join(candidateRoot, relative));
    const destination = assertPathWithin(destinationRoot, path.join(destinationRoot, relative));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    copied += 1;
  }
  await copyFile(path.join(candidateRoot, "manifest.json"), destinationManifestPath);
  return { copied: copied + 1, removed };
}

export function registerMaintenanceTools(server: McpServer): void {
  server.registerTool(
    "maintenance.get_status",
    {
      title: "Check local advisor data status",
      description: "Report whether configured public and private repositories, the Japanese catalog, local game source, and inventory profiles are available. Does not reveal profile contents.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ server: z.enum(["ja", "global"]) }),
    },
    async ({ server: selectedServer }) => {
      try {
        const { config, configPath, configFileExists, warnings } = await loadConfig();
        const publicRoot = config.publicRepoRoot;
        const privateRoot = config.privateRepoRoot;
        const result = {
          config_path: configPath,
          config_file_exists: configFileExists,
          auto_sync_inventory: config.autoSyncInventory,
          public_repo_root_exists: await stat(publicRoot).then(() => true).catch(() => false),
          private_repo_root_exists: await stat(privateRoot).then(() => true).catch(() => false),
          local_game_root_exists: await stat(config.gameRoot).then(() => true).catch(() => false),
          server: selectedServer,
          warnings,
        };
        const manifestPath = path.join(publicRoot, "data", selectedServer, "manifest.json");
        try {
          const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
          Object.assign(result, { catalog_status: manifest.coverage_status, catalog_generated_at_utc: manifest.generated_at_utc, catalog_counts: manifest.counts });
        } catch {
          Object.assign(result, { catalog_status: "unavailable" });
        }
        return reply(result);
      } catch (error) {
        return reply({ status: "unavailable", error: String(error) });
      }
    },
  );

  server.registerTool(
    "maintenance.preview_catalog_refresh",
    {
      title: "Preview a local catalog refresh",
      description: "Read the configured local Japanese game install and current GameTora feeds into an ignored staging candidate, then run the production coverage validator. This does not modify or publish the public catalog.",
      annotations: { readOnlyHint: false },
      inputSchema: z.object({ server: z.enum(["ja", "global"]) }),
    },
    async ({ server: selectedServer }) => {
      try {
        const chosenServer = selectedServer as Server;
        if (chosenServer === "global") return reply({ server: chosenServer, status: "source_unavailable", message: "No verified Global install or export is configured; no JP data was copied." });
        const { config } = await loadConfig();
        if (!config.gameRoot || !(await stat(config.gameRoot).then(() => true).catch(() => false))) {
          return reply({ server: chosenServer, status: "source_unavailable", message: "No local Japanese game install is available on this host. Use a Windows machine with the installed game to refresh catalog data; this host can continue serving the published catalog." });
        }
        const stagingRoot = assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, ".staging", "catalog-candidates"));
        const candidateId = `ja-${randomUUID().replace(/-/g, "").slice(0, 8)}-${Date.now()}`;
        const candidateRoot = assertPathWithin(stagingRoot, path.join(stagingRoot, candidateId, "ja"));
        const exporter = assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, "scripts", "export_catalog.py"));
        const result = await runCli(config.pythonPath, [
          exporter,
          "--game-root", config.gameRoot,
          "--refresh-gametora",
          "--output-root", candidateRoot,
        ], config.publicRepoRoot);
        if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `Catalog export exited with ${result.code}`);
        const exportSummary = parseSummary(result.stdout, "Catalog exporter");
        const validation = await runValidator(config, chosenServer, candidateRoot);
        const metadata = {
          candidate_id: candidateId,
          server: chosenServer,
          created_at_utc: new Date().toISOString(),
          catalog_root: candidateRoot,
          source_master_sha256: exportSummary.master_sha256,
          coverage_status: validation.coverage_status,
          counts: exportSummary.counts,
          support_mapping: exportSummary.gametora_reconciliation?.support_cards,
          trainee_mapping: exportSummary.gametora_reconciliation?.trainee_outfits,
          blocking_issues: validation.blocking_issues,
        };
        await writeJsonAtomic(path.join(getStateRoot(), "catalog-candidates", `${candidateId}.json`), metadata);
        return reply({ status: "candidate_ready_for_review", ...metadata, coverage_report: validation });
      } catch (error) {
        return reply({ server: selectedServer, status: "refresh_failed", error: String(error) });
      }
    },
  );

  server.registerTool(
    "maintenance.publish_catalog_update",
    {
      title: "Publish a reviewed catalog candidate",
      description: "Publish a previously previewed candidate to the configured public repository and push only its selected server data directory. Call only after reviewing the candidate summary and coverage report. Global publication is blocked while its source is unavailable.",
      annotations: { readOnlyHint: false },
      inputSchema: z.object({ server: z.enum(["ja", "global"]), candidate_id: z.string().min(12).max(80) }),
    },
    async ({ server: selectedServer, candidate_id }) => {
      try {
        const { config } = await loadConfig();
        const candidate = await readCandidate(config, candidate_id);
        if (candidate.server !== selectedServer) throw new Error("Candidate server does not match the requested server");
        if (candidate.server === "global") throw new Error("Global catalog publication is blocked until an independent Global source is verified");

        const validation = await runValidator(config, candidate.server, candidate.root);
        const candidateManifest = JSON.parse(await readFile(path.join(candidate.root, "manifest.json"), "utf8")) as Record<string, any>;
        if (candidateManifest.coverage_status === "source_unavailable") throw new Error("Candidate source is unavailable");

        const remote = await git(config, ["remote", "get-url", "origin"]);
        if (!expectedPublicRemote(remote)) throw new Error("Configured public repository origin does not match the authorized catalog repository");
        const branch = await git(config, ["branch", "--show-current"]);
        if (!branch) throw new Error("Configured public repository has no checked-out branch");
        const dataPath = `data/${candidate.server}`;
        const dirtyData = await git(config, ["status", "--porcelain", "--", dataPath]);
        if (dirtyData) throw new Error(`${dataPath} has local changes; review or commit them before publishing this candidate`);

        const destination = assertPathWithin(config.publicRepoRoot, path.join(config.publicRepoRoot, "data", candidate.server));
        const copied = await copyGeneratedCatalog(candidate.root, destination);
        const publishedValidation = await runValidator(config, candidate.server, destination);
        await git(config, ["add", "--", dataPath]);
        const staged = await runCli("git", ["diff", "--cached", "--quiet", "--", dataPath], config.publicRepoRoot, 60_000);
        if (staged.code === 0) return reply({ status: "no_changes", server: candidate.server, candidate_id, coverage_status: publishedValidation.coverage_status, files: copied });
        if (staged.code !== 1) throw new Error(staged.stderr.trim() || "Unable to inspect staged catalog changes");
        const commitResult = await runCli("git", ["commit", "--only", "-m", `Refresh ${candidate.server} reference catalog`, "--", dataPath], config.publicRepoRoot, 120_000);
        if (commitResult.code !== 0) throw new Error(commitResult.stderr.trim() || "Catalog commit failed; the local data update remains in the configured checkout");
        const commit = await git(config, ["rev-parse", "HEAD"]);
        const pushed = await runCli("git", ["push", "origin", branch], config.publicRepoRoot, 120_000);
        return reply({
          status: pushed.code === 0 ? "published" : "local_commit_retained_push_failed",
          server: candidate.server,
          candidate_id,
          commit,
          pushed: pushed.code === 0,
          push_error: pushed.code === 0 ? null : pushed.stderr.trim() || pushed.stdout.trim(),
          coverage_status: publishedValidation.coverage_status,
          coverage_report: publishedValidation,
          files: copied,
        });
      } catch (error) {
        return reply({ server: selectedServer, candidate_id, status: "publish_failed", error: String(error) });
      }
    },
  );
}
