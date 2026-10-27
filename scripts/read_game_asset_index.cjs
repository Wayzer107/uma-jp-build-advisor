#!/usr/bin/env node
"use strict";

// Windows extraction helper for the installed JP game. This reads the local
// encrypted asset metadata database and the unencrypted master database only.
// It never downloads assets or writes to the game installation.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_GAME_ROOT = String.raw`C:\Steam\steamapps\common\UmamusumePrettyDerby_Jpn`;
const SQLITE_BASE_KEY = Buffer.from("f170cea4dfcea3e1a5d8c70bd1", "hex");
const SQLITE_PLAIN_KEY = Buffer.from("6d5b65336336632554712d73505363386d34377b356370233734532973433633", "hex");

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const args = { gameRoot: DEFAULT_GAME_ROOT, server: "ja", supportIds: [], traineeIds: [], all: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      if (!argv[index + 1]) throw new Error(`Missing value for ${flag}`);
      return argv[++index];
    };
    if (flag === "--game-root") args.gameRoot = path.resolve(next());
    else if (flag === "--server") args.server = next();
    else if (flag === "--support-id") args.supportIds.push(next());
    else if (flag === "--trainee-id") args.traineeIds.push(next());
    else if (flag === "--all") args.all = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!new Set(["ja", "global"]).has(args.server)) throw new Error("--server must be ja or global");
  if (args.all && (args.supportIds.length || args.traineeIds.length)) throw new Error("Use --all or selected IDs, not both");
  if (!args.all && !args.supportIds.length && !args.traineeIds.length) throw new Error("Select --all or pass at least one --support-id / --trainee-id");
  return args;
}

function catalogIds(catalogRoot, kind, all, requested, requireCatalog) {
  const directory = path.join(catalogRoot, kind === "support_card" ? "support-cards" : "trainees");
  const ids = all
    ? (fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)) : [])
    : requested;
  const unique = [...new Set(ids.map(String))];
  for (const id of unique) {
    if (!/^\d{1,12}$/.test(id)) throw new Error(`Invalid ${kind} catalog ID: ${id}`);
    if (!requireCatalog) continue;
    const filename = path.join(directory, `${id}.json`);
    if (!fs.existsSync(filename)) throw new Error(`Catalog record is absent: ${filename}`);
    const record = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (String(record.id) !== id) throw new Error(`Catalog filename/ID mismatch in ${filename}`);
  }
  return unique.sort((left, right) => Number(left) - Number(right));
}

function sha256File(filename) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filename);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function gamePaths(gameRoot) {
  const persistent = path.join(gameRoot, "UmamusumePrettyDerby_Jpn_Data", "Persistent");
  return {
    persistent,
    master: path.join(persistent, "master", "master.mdb"),
    meta: path.join(persistent, "meta"),
    catalogRoot: path.resolve(__dirname, "..", "data"),
  };
}

function readAssetRows(metaDb, name) {
  return metaDb.prepare("SELECT i, m, n, h, l, e FROM a WHERE n = ? ORDER BY i").all(name).map((row) => ({
    index: String(row.i),
    kind: row.m,
    name: row.n,
    bundle_hash: row.h,
    bundle_bytes: String(row.l),
    encryption_key: String(row.e),
  }));
}

function baseRecord(server, kind, id, variant) {
  return { key: `${server}:${kind}:${id}:${variant}`, server, kind, catalog_id: id, variant };
}

function buildAssets(metaDb, masterDb, persistent, server, kind, id) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId)) throw new Error(`Catalog ID is outside the supported integer range: ${id}`);
  if (kind === "support_card") {
    const catalog = masterDb.prepare("SELECT id, chara_id, rarity FROM support_card_data WHERE id = ?").get(numericId);
    return [{ variant: "thumbnail", texture: `support_thumb_${id}` }, { variant: "card", texture: `support_card_s_${id}` }, { variant: "portrait", texture: `tex_support_card_${id}` }].map(({ variant, texture }) => {
    const name = `supportcard/support${id}/${texture}`;
    const rows = readAssetRows(metaDb, name);
    const record = baseRecord(server, kind, id, variant);
    if (!catalog || rows.length !== 1) {
      return { ...record, status: "unresolved", reason: !catalog ? "exact support_card_data row not found" : `expected one exact meta row, found ${rows.length}`, source_mapping: { master_table: "support_card_data", master_id: numericId, asset_name: name } };
    }
    const row = rows[0];
    const cachePath = path.join(persistent, "dat", row.bundle_hash.slice(0, 2), row.bundle_hash);
    return {
      ...record,
      status: fs.existsSync(cachePath) ? "available" : "missing",
      reason: fs.existsSync(cachePath) ? undefined : "indexed bundle is not present in the local cache",
      bundle_hash: row.bundle_hash,
      bundle_bytes: row.bundle_bytes,
      encryption_key: row.encryption_key,
      cache_relative_path: path.posix.join("dat", row.bundle_hash.slice(0, 2), row.bundle_hash),
      source_mapping: {
        master_table: "support_card_data",
        master_row: { id: String(catalog.id), chara_id: String(catalog.chara_id), rarity: Number(catalog.rarity) },
        metadata_table: "a",
        metadata_row_id: row.index,
        metadata_kind: row.kind,
        asset_name: name,
      },
    };
    });
  }

  const catalog = masterDb.prepare("SELECT id, chara_id, default_rarity FROM card_data WHERE id = ?").get(numericId);
  const rarityRows = catalog
    ? masterDb.prepare("SELECT id, card_id, rarity, race_dress_id FROM card_rarity_data WHERE card_id = ? ORDER BY rarity").all(numericId)
    : [];
  const charaId = catalog ? String(catalog.chara_id) : "";
  const base = `chara/chr${charaId}`;
  const variants = [
    { variant: "icon", name: `${base}/chr_icon_${charaId}_${id}_01`, expectedKind: "chara" },
    { variant: "portrait", name: `${base}/chara_stand_${charaId}_${id}`, expectedKind: "chara" },
  ];
  return variants.map(({ variant, name, expectedKind }) => {
    const record = baseRecord(server, kind, id, variant);
    if (!catalog || !rarityRows.length) {
      return { ...record, status: "unresolved", reason: !catalog ? "exact card_data outfit row not found" : "card_rarity_data relationship rows not found", source_mapping: { master_table: "card_data", master_id: numericId, asset_name: name } };
    }
    const rows = readAssetRows(metaDb, name);
    if (rows.length !== 1) {
      return { ...record, status: "unresolved", reason: `expected one exact meta row, found ${rows.length}`, source_mapping: { master_table: "card_data", master_id: numericId, asset_name: name } };
    }
    const row = rows[0];
    const cachePath = path.join(persistent, "dat", row.bundle_hash.slice(0, 2), row.bundle_hash);
    return {
      ...record,
      status: fs.existsSync(cachePath) ? "available" : "missing",
      reason: fs.existsSync(cachePath) ? undefined : "indexed bundle is not present in the local cache",
      bundle_hash: row.bundle_hash,
      bundle_bytes: row.bundle_bytes,
      encryption_key: row.encryption_key,
      cache_relative_path: path.posix.join("dat", row.bundle_hash.slice(0, 2), row.bundle_hash),
      source_mapping: {
        master_table: "card_data",
        master_row: { id: String(catalog.id), chara_id: charaId, default_rarity: Number(catalog.default_rarity) },
        rarity_table: "card_rarity_data",
        rarity_rows: rarityRows.map((rarity) => ({ id: String(rarity.id), card_id: String(rarity.card_id), rarity: Number(rarity.rarity), race_dress_id: String(rarity.race_dress_id) })),
        metadata_table: "a",
        metadata_row_id: row.index,
        metadata_kind: row.kind,
        asset_name: name,
        expected_asset_kind: expectedKind,
      },
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: read_game_asset_index.cjs --game-root PATH --server ja|global (--all | --support-id ID | --trainee-id ID ...)\n");
    return;
  }
  const paths = gamePaths(args.gameRoot);
  const catalogRoot = path.join(paths.catalogRoot, args.server);
  const supportIds = catalogIds(catalogRoot, "support_card", args.all, args.supportIds, args.server === "ja");
  const traineeIds = catalogIds(catalogRoot, "trainee", args.all, args.traineeIds, args.server === "ja");
  const entries = [];
  if (args.server === "global") {
    for (const id of supportIds) for (const variant of ["thumbnail", "card", "portrait"]) entries.push({ ...baseRecord("global", "support_card", id, variant), status: "unavailable", reason: "no independently verified Global game asset source is configured" });
    for (const id of traineeIds) for (const variant of ["icon", "portrait"]) entries.push({ ...baseRecord("global", "trainee", id, variant), status: "unavailable", reason: "no independently verified Global game asset source is configured" });
    process.stdout.write(JSON.stringify({ server: "global", entries }));
    return;
  }
  for (const filename of [paths.master, paths.meta]) if (!fs.existsSync(filename)) throw new Error(`Required local game database not found: ${filename}`);
  const nodeModules = process.env.UMABUILD_META_NODE_MODULES || path.join(process.env.LOCALAPPDATA || "", "UmaBuildAdvisor", "meta-reader", "node_modules");
  const Database = require(path.join(nodeModules, "better-sqlite3-multiple-ciphers"));
  const masterDb = new Database(paths.master, { readonly: true, fileMustExist: true });
  const metaDb = new Database(paths.meta, { readonly: true, fileMustExist: true });
  try {
    masterDb.defaultSafeIntegers(true);
    metaDb.defaultSafeIntegers(true);
    const databaseKey = Buffer.from(SQLITE_PLAIN_KEY.map((value, index) => value ^ SQLITE_BASE_KEY[index % 13]));
    metaDb.pragma(`hexkey='${databaseKey.toString("hex")}'`);
    metaDb.pragma("query_only=ON");
    for (const id of supportIds) entries.push(...buildAssets(metaDb, masterDb, paths.persistent, "ja", "support_card", id));
    for (const id of traineeIds) entries.push(...buildAssets(metaDb, masterDb, paths.persistent, "ja", "trainee", id));
    const [masterSha256, metaSha256] = await Promise.all([sha256File(paths.master), sha256File(paths.meta)]);
    process.stdout.write(JSON.stringify({
      server: "ja",
      source: {
        game: "Umamusume Pretty Derby Japanese Steam install",
        source_build_hash: masterSha256,
        master_sha256: masterSha256,
        metadata_index_sha256: metaSha256,
        metadata_index_table: "a",
        read_only: true,
      },
      entries,
    }));
  } finally {
    metaDb.close();
    masterDb.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
