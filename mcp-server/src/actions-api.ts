import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getRecord, readManifest, recordKinds, searchRecords, type RecordKind, type Server } from "./repositories/catalog-reader.js";
import { readProfile } from "./repositories/profile-reader.js";
import { loadConfig } from "./config.js";

const host = process.env.UMABUILD_ACTIONS_HOST || "127.0.0.1";
const port = Number(process.env.UMABUILD_ACTIONS_PORT || "8787");
const bearerToken = process.env.UMABUILD_ACTIONS_TOKEN || "";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("UMABUILD_ACTIONS_PORT must be an integer between 1 and 65535.");
}
if (Buffer.byteLength(bearerToken, "utf8") < 32) {
  throw new Error("Set UMABUILD_ACTIONS_TOKEN to a random value with at least 32 bytes.");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(value));
}

function authorized(request: IncomingMessage): boolean {
  const header = request.headers.authorization || "";
  const match = /^Bearer ([^\s]+)$/.exec(header);
  if (!match) return false;
  const supplied = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(bearerToken, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function parseServer(value: string | null): Server | null {
  return value === "ja" || value === "global" ? value : null;
}

function parseKind(value: string | null): RecordKind | null {
  return value && recordKinds().includes(value as RecordKind) ? value as RecordKind : null;
}

function fail(response: ServerResponse, status: number, error: string, message: string): void {
  json(response, status, { error, message });
}

const app = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

  if (request.method === "GET" && requestUrl.pathname === "/healthz") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    fail(response, 405, "method_not_allowed", "This read-only API accepts GET requests.");
    return;
  }

  if (!authorized(request)) {
    response.setHeader("www-authenticate", "Bearer");
    fail(response, 401, "unauthorized", "A valid bearer token is required.");
    return;
  }

  try {
    const { config } = await loadConfig();

    if (requestUrl.pathname === "/v1/catalog/manifest") {
      const server = parseServer(requestUrl.searchParams.get("server"));
      if (!server) return fail(response, 400, "invalid_server", "Use server=ja or server=global.");
      const manifest = await readManifest(config, server);
      json(response, 200, { server, manifest });
      return;
    }

    if (requestUrl.pathname === "/v1/catalog/search") {
      const server = parseServer(requestUrl.searchParams.get("server"));
      const kind = parseKind(requestUrl.searchParams.get("kind"));
      const query = requestUrl.searchParams.get("query") || "";
      const limitValue = requestUrl.searchParams.get("limit");
      const limit = limitValue === null ? 10 : Number(limitValue);
      if (!server) return fail(response, 400, "invalid_server", "Use server=ja or server=global.");
      if (!kind) return fail(response, 400, "invalid_kind", "Use a catalog kind listed in the Action schema.");
      if (!query.trim() || query.length > 120) return fail(response, 400, "invalid_query", "Query must contain 1 to 120 characters.");
      if (!Number.isInteger(limit) || limit < 1 || limit > 25) return fail(response, 400, "invalid_limit", "Limit must be an integer from 1 to 25.");
      const manifest = await readManifest(config, server);
      const records = await searchRecords(config, server, kind, query, limit);
      json(response, 200, {
        server,
        kind,
        catalog_status: manifest.coverage_status,
        catalog_generated_at_utc: manifest.generated_at_utc,
        source: manifest.source,
        match_count: records.length,
        records,
      });
      return;
    }

    if (requestUrl.pathname === "/v1/catalog/record") {
      const server = parseServer(requestUrl.searchParams.get("server"));
      const kind = parseKind(requestUrl.searchParams.get("kind"));
      const id = requestUrl.searchParams.get("id") || "";
      if (!server) return fail(response, 400, "invalid_server", "Use server=ja or server=global.");
      if (!kind) return fail(response, 400, "invalid_kind", "Use a catalog kind listed in the Action schema.");
      if (!/^\d+$/.test(id)) return fail(response, 400, "invalid_id", "Record ID must contain digits only.");
      const manifest = await readManifest(config, server);
      const record = await getRecord(config, server, kind, id);
      json(response, 200, {
        server,
        kind,
        id,
        catalog_status: manifest.coverage_status,
        catalog_generated_at_utc: manifest.generated_at_utc,
        status: record ? "available" : manifest.coverage_status === "source_unavailable" ? "source_unavailable" : "not_found",
        record,
      });
      return;
    }

    if (requestUrl.pathname === "/v1/inventory/profile") {
      const server = parseServer(requestUrl.searchParams.get("server"));
      if (!server) return fail(response, 400, "invalid_server", "Use server=ja or server=global.");
      const profile = await readProfile(config, server);
      json(response, 200, profile);
      return;
    }

    fail(response, 404, "not_found", "No Action API route matches this path.");
  } catch (error) {
    console.error("Actions API request failed:", error instanceof Error ? error.name : "UnknownError");
    fail(response, 500, "service_error", "The requested catalog or inventory data could not be read.");
  }
});

app.listen(port, host, () => {
  console.log("Uma Build Advisor Actions API listening on " + host + ":" + port);
});
