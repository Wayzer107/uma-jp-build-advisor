import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

export type AdvisorConfig = {
  publicRepoRoot: string;
  privateRepoRoot: string;
  gameRoot: string;
  pythonPath: string;
  autoSyncInventory: boolean;
};

export type LoadedConfig = {
  config: AdvisorConfig;
  configPath: string;
  configFileExists: boolean;
  warnings: string[];
};

const defaultRepoHome = process.platform === "win32"
  ? path.join(homedir(), "Documents", "Codex")
  : homedir();
const defaultPublicRepo = path.join(defaultRepoHome, "uma-jp-build-advisor-public");
const defaultPrivateRepo = path.join(defaultRepoHome, "uma-jp-build-advisor-private");
const defaultGameRoot = process.platform === "win32"
  ? "C:\\Steam\\steamapps\\common\\UmamusumePrettyDerby_Jpn"
  : "";
const defaultPythonPath = process.platform === "win32" ? "python" : "python3";

export function getConfigPath(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local");
    return path.join(localAppData, "UmaBuildAdvisor", "config.json");
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(configHome, "uma-build-advisor", "config.json");
}

export function getStateRoot(): string {
  return path.dirname(getConfigPath());
}

export async function loadConfig(): Promise<LoadedConfig> {
  const configPath = getConfigPath();
  const warnings: string[] = [];
  let supplied: Partial<AdvisorConfig> = {};
  let configFileExists = false;
  try {
    supplied = JSON.parse(await readFile(configPath, "utf8")) as Partial<AdvisorConfig>;
    configFileExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      warnings.push("Local config could not be parsed; defaults and environment overrides are in effect.");
    }
  }

  const config: AdvisorConfig = {
    publicRepoRoot: process.env.UMABUILD_PUBLIC_REPO_ROOT || supplied.publicRepoRoot || defaultPublicRepo,
    privateRepoRoot: process.env.UMABUILD_PRIVATE_REPO_ROOT || supplied.privateRepoRoot || defaultPrivateRepo,
    gameRoot: process.env.UMAMUSUME_GAME_ROOT || supplied.gameRoot || defaultGameRoot,
    pythonPath: process.env.UMABUILD_PYTHON || supplied.pythonPath || defaultPythonPath,
    autoSyncInventory: process.env.UMABUILD_AUTO_SYNC_INVENTORY === "true" || supplied.autoSyncInventory === true,
  };
  if (!config.gameRoot) warnings.push("No local Japanese game install is configured; catalog refresh is unavailable on this host.");
  return { config, configPath, configFileExists, warnings };
}

export function isPathWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertPathWithin(root: string, target: string): string {
  const resolved = path.resolve(target);
  if (!isPathWithin(root, resolved)) {
    throw new Error("Requested path resolves outside the configured repository root");
  }
  return resolved;
}
