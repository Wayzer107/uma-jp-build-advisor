import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { loadConfig, isPathWithin } from "../config.js";
import { readJsonCached } from "../repositories/json-file-cache.js";
import { MCP_REPLY_BUDGET } from "./response-budget.js";

const MAX_REQUESTS = 12;
const MAX_IMAGE_BYTES = 240 * 1024;
const MAX_IMAGE_DIMENSION = 1024;

const ImageRequestSchema = z.object({
  server: z.enum(["ja", "global"]),
  kind: z.enum(["support_card", "trainee"]),
  catalog_id: z.string().regex(/^\d{1,12}$/),
  variant: z.enum(["thumbnail", "card", "icon", "portrait"]),
}).strict().superRefine((request, context) => {
  const variantMatches = request.kind === "support_card"
    ? request.variant === "thumbnail" || request.variant === "card" || request.variant === "portrait"
    : request.variant === "icon" || request.variant === "portrait";
  if (!variantMatches) context.addIssue({ code: "custom", message: "The requested art variant does not match its catalog kind." });
});

const GetImagesSchema = z.object({
  requests: z.array(ImageRequestSchema).min(1).max(MAX_REQUESTS),
  offset: z.number().int().min(0).max(MAX_REQUESTS).default(0),
}).strict();

export type ImageRequest = z.infer<typeof ImageRequestSchema>;
type ManifestAsset = {
  key?: unknown;
  server?: unknown;
  kind?: unknown;
  catalog_id?: unknown;
  variant?: unknown;
  status?: unknown;
  reason?: unknown;
  relative_path?: unknown;
  mime_type?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
  sha256?: unknown;
};
type ImageManifest = { schema_version?: unknown; assets?: Record<string, ManifestAsset> };
export type ImagePayload = {
  assets: Array<{
    key: string;
    status: "available" | "missing" | "unresolved" | "unavailable";
    mime_type?: string;
    width?: number;
    height?: number;
    sha256?: string;
    data_base64?: string;
    reason?: string;
  }>;
  next_offset: number;
  has_more: boolean;
  requested: number;
};

function keyFor(request: ImageRequest): string {
  return `${request.server}:${request.kind}:${request.catalog_id}:${request.variant}`;
}

function unavailable(request: ImageRequest, reason: string): ImagePayload["assets"][number] {
  return { key: keyFor(request), status: "unavailable", reason };
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const declaredLength = bytes.readUInt32LE(4) + 8;
  if (declaredLength > bytes.length) return null;
  let offset = 12;
  while (offset + 8 <= declaredLength) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + chunkSize > declaredLength) return null;
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: 1 + bytes[data + 4]! + (bytes[data + 5]! << 8) + (bytes[data + 6]! << 16),
        height: 1 + bytes[data + 7]! + (bytes[data + 8]! << 8) + (bytes[data + 9]! << 16),
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && bytes[data] === 0x2f) {
      return {
        width: 1 + bytes[data + 1]! + ((bytes[data + 2]! & 0x3f) << 8),
        height: 1 + ((bytes[data + 2]! >> 6) | (bytes[data + 3]! << 2) | ((bytes[data + 4]! & 0x0f) << 10)),
      };
    }
    if (chunkType === "VP8 " && chunkSize >= 10) {
      for (let position = data; position + 7 < data + chunkSize; position += 1) {
        if (bytes[position] === 0x9d && bytes[position + 1] === 0x01 && bytes[position + 2] === 0x2a) {
          return {
            width: bytes.readUInt16LE(position + 3) & 0x3fff,
            height: bytes.readUInt16LE(position + 5) & 0x3fff,
          };
        }
      }
      return null;
    }
    offset = data + chunkSize + (chunkSize & 1);
  }
  return null;
}

function safeAssetPath(assetRoot: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || segments.some((segment) => segment === ".." || segment === "")) {
    throw new Error("The image manifest contains an unsafe relative path.");
  }
  const candidate = path.resolve(assetRoot, ...segments);
  if (!isPathWithin(assetRoot, candidate)) throw new Error("The image path escapes the configured asset directory.");
  return candidate;
}

async function readManifest(assetRoot: string): Promise<ImageManifest> {
  const manifest = await readJsonCached<ImageManifest>(path.join(assetRoot, "manifest.json"));
  if (manifest.schema_version !== 1 || !manifest.assets || typeof manifest.assets !== "object" || Array.isArray(manifest.assets)) {
    throw new Error("The installed artwork manifest uses an unsupported format.");
  }
  return manifest;
}

async function resolveImage(request: ImageRequest, assetRoot: string, manifest: ImageManifest): Promise<ImagePayload["assets"][number]> {
  const key = keyFor(request);
  if (request.server === "global") return unavailable(request, "No independently verified Global artwork source is available.");
  const entry = manifest.assets![key];
  if (!entry) return { key, status: "unavailable", reason: "No reviewed Japanese artwork is indexed for this exact catalog ID." };
  if (entry.key !== key || entry.server !== request.server || entry.kind !== request.kind || String(entry.catalog_id) !== request.catalog_id || entry.variant !== request.variant) {
    return { key, status: "unresolved", reason: "The artwork manifest identity does not match the requested catalog record." };
  }
  if (entry.status !== "available") {
    const status = entry.status === "missing" || entry.status === "unresolved" ? entry.status : "unavailable";
    return { key, status, reason: typeof entry.reason === "string" ? entry.reason : "No verified derivative is available." };
  }
  if (entry.mime_type !== "image/webp" || typeof entry.relative_path !== "string" || !Number.isInteger(entry.width) || !Number.isInteger(entry.height) || !Number.isInteger(entry.bytes) || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    return { key, status: "unresolved", reason: "The artwork manifest entry is incomplete or uses an unsupported image format." };
  }
  if ((entry.width as number) < 1 || (entry.height as number) < 1 || (entry.width as number) > MAX_IMAGE_DIMENSION || (entry.height as number) > MAX_IMAGE_DIMENSION || (entry.bytes as number) < 1 || (entry.bytes as number) > MAX_IMAGE_BYTES) {
    return { key, status: "unresolved", reason: "The image exceeds the supported encoded-size or decoded-dimension limit." };
  }
  const candidate = safeAssetPath(assetRoot, entry.relative_path);
  let rootReal: string;
  let fileReal: string;
  try {
    [rootReal, fileReal] = await Promise.all([realpath(assetRoot), realpath(candidate)]);
  } catch {
    return { key, status: "missing", reason: "The indexed image file is not installed on this MCP host." };
  }
  if (!isPathWithin(rootReal, fileReal)) return { key, status: "unresolved", reason: "The indexed image resolves outside the configured asset directory." };
  const info = await stat(fileReal);
  if (!info.isFile() || info.size !== entry.bytes) return { key, status: "unresolved", reason: "The image file size does not match its manifest." };
  const bytes = await readFile(fileReal);
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) return { key, status: "unresolved", reason: "The image checksum does not match its manifest." };
  const actualDimensions = webpDimensions(bytes);
  if (!actualDimensions || actualDimensions.width !== entry.width || actualDimensions.height !== entry.height || actualDimensions.width > MAX_IMAGE_DIMENSION || actualDimensions.height > MAX_IMAGE_DIMENSION) {
    return { key, status: "unresolved", reason: "The image header dimensions do not match its manifest or exceed the supported limit." };
  }
  return {
    key,
    status: "available",
    mime_type: "image/webp",
    width: actualDimensions.width,
    height: actualDimensions.height,
    sha256: entry.sha256,
    data_base64: bytes.toString("base64"),
  };
}

function result(payload: ImagePayload) {
  const summary = {
    assets: payload.assets.map(({ key, status, width, height, reason }) => ({ key, status, width, height, reason })),
    next_offset: payload.next_offset,
    has_more: payload.has_more,
    requested: payload.requested,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(summary) }],
    structuredContent: payload,
  };
}

function replyBytes(payload: ImagePayload): number {
  return Buffer.byteLength(JSON.stringify(result(payload)));
}

export async function loadGameImages(requests: ImageRequest[], offset = 0, budget = MCP_REPLY_BUDGET): Promise<ImagePayload> {
  const config = await loadConfig();
  const output: ImagePayload["assets"] = [];
  let nextOffset = Math.min(offset, requests.length);
  let manifest: ImageManifest | null = null;
  let manifestError: string | null = null;
  if (requests.slice(nextOffset).some((request) => request.server === "ja")) {
    try {
      manifest = await readManifest(config.config.assetRoot);
    } catch {
      manifestError = "Japanese artwork is not installed or its manifest could not be read on this MCP host.";
    }
  }

  while (nextOffset < requests.length) {
    const request = requests[nextOffset]!;
    const resolved = request.server === "global"
      ? unavailable(request, "No independently verified Global artwork source is available.")
      : manifest
        ? await resolveImage(request, config.config.assetRoot, manifest).catch(() => unavailable(request, "The verified artwork could not be read on this MCP host."))
        : unavailable(request, manifestError || "Japanese artwork is not installed on this MCP host.");
    const candidateAssets = [...output, resolved];
    const candidateOffset = nextOffset + 1;
    const candidate: ImagePayload = {
      assets: candidateAssets,
      next_offset: candidateOffset,
      has_more: candidateOffset < requests.length,
      requested: requests.length,
    };
    if (replyBytes(candidate) > budget) {
      if (output.length === 0) {
        output.push(unavailable(request, "This image could not fit the safe MCP transfer budget."));
        nextOffset += 1;
      }
      break;
    }
    output.push(resolved);
    nextOffset = candidateOffset;
  }

  return { assets: output, next_offset: nextOffset, has_more: nextOffset < requests.length, requested: requests.length };
}

export function registerGameImageTools(server: McpServer): void {
  registerAppTool(
    server,
    "build.get_game_images",
    {
      title: "Load recommendation artwork",
      description: "App-only read tool. Resolve exact catalog artwork for the current Japanese recommendation. The app supplies server, record kind, catalog ID, and approved variant; no filesystem paths or image URLs are accepted.",
      annotations: { readOnlyHint: true },
      inputSchema: GetImagesSchema,
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ requests, offset }: z.infer<typeof GetImagesSchema>) => {
      return result(await loadGameImages(requests, offset));
    },
  );
}
