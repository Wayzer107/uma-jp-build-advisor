# Agent task: installed-game images in the MCP Build View

Implement support-card artwork, trainee outfit icons, and trainee portraits/card images in the existing Umamusume Build Advisor MCP UI, using assets from the user's locally installed Japanese game. Proceed with implementation; do not restart brainstorming or ask for approval of the already-authorized task. Make routine implementation choices, and report actual source/access gaps when encountered.

This is a task brief, not another progress record. Maintain progress and verification in `docs/handoff/current-status.md` only. Private deployment identifiers remain in the separate private repository's deployment reference.

## Start from the current project

Read `AGENTS.md`, `README.md`, `docs/local-plugin-setup.md`, `docs/inventory-profile.md`, `docs/reference-coverage.md`, and `docs/handoff/current-status.md`.

The Pi public checkout is `~/Sources/uma`; the separate private checkout is `~/Sources/uma-private`. The installed Japanese game and asset extraction belong on Windows. Locate the actual Windows source checkout and game installation; do not assume that the Pi contains the game.

At the time this brief was written, the current deployed server and account plugin are v0.3.0. The server exposes thirteen tools, including `inventory.get_summary`, `inventory.query_records`, and `reference.get_records`. Performance changes are present in the Pi working tree and remain uncommitted. An older Windows checkout or GitHub HEAD may not contain them. Inspect and synchronize the current source without overwriting pending work; do not reset either working tree or replace the optimized server with an older bundle. Check the canonical status record for subsequent changes before starting.

Keep the existing plugin identity, registered ChatGPT app, Secure MCP Tunnel, private audience, and Pi runtime. No public image server, CDN, Funnel, Custom GPT, or new OpenAI API key is needed for the preferred implementation. Use the existing MCP connection for image delivery.

## Inspect the local source read-only

The repository currently defaults to this Windows game root:

```text
C:\Steam\steamapps\common\UmamusumePrettyDerby_Jpn
```

Treat it as a discovery starting point, not a verified path on the new host. `scripts/catalog_records.py` owns `DEFAULT_GAME_ROOT`, `default_source_paths`, and `open_master_read_only`. Its expected master path is:

```text
<game-root>\UmamusumePrettyDerby_Jpn_Data\Persistent\master\master.mdb
```

Existing extraction supports catalog facts and some Hachimi story JSON; it does not implement artwork extraction. Inspect the actual game's asset metadata/index, local asset cache/bundles, and any existing extracted textures/sprites. Discover and document their real formats and paths. Do not invent bundle filenames, cache schemas, encryption/compression handling, or image-ID formulas. Open databases read-only and never modify the installation or game downloader.

Use the installed version's actual asset metadata and an appropriate decoder. If Unity bundles/sprite atlases require UnityPy/Pillow or another extractor, verify its current upstream documentation and compatibility first. Keep extraction-only dependencies isolated on Windows; do not add them to the Node/Pi runtime. Correctly handle sprite rectangles, packing rotation, orientation, and alpha using source metadata.

## Resolve exact catalog identities

Use `data/ja/support-cards/<id>.json` and `data/ja/trainees/<id>.json` as the record identity sources. Read the installed database relationships and asset metadata to establish the image joins.

- Support art must identify the exact `support_card_data.id`, including rarity/card variants; a character name or `chara_id` alone is insufficient.
- The user explicitly wants the full portrait-format support-card illustrations at their original aspect ratio. Square `support_thumb_<id>` assets are icons, not substitutes for full card artwork. Inspect the source metadata for the full illustration mapping and preserve its decoded dimensions/aspect ratio; do not stretch square thumbnails or invent missing borders/art to fill portrait slots.
- Trainee art must identify the exact `card_data.id` outfit. Inspect any additional outfit/dress/rarity tables and asset relationships required by this installed version. Do not substitute another outfit of the same character.
- GameTora `tid`, character ID, outfit ID, veteran ID, and asset ID are different namespaces. Do not interchange them.
- Use only Japanese assets for `ja`. Global has no independently verified source; return unavailable for Global art rather than silently reusing Japanese mappings.
- A missing or unverified image gets a named placeholder. Do not invent art, scrape a guide, or silently guess a mapping.

Start with a small candidate set and visually inspect several support rarities and multiple outfits of the same trainee against their catalog identities before extracting the broader set.

## Add an incremental asset pipeline

Add an extraction command, for example `scripts/extract_game_images.py`, with explicit server, game root, output root, dry-run/candidate mode, and selected-ID options. These are proposed interfaces to implement, not commands that already exist. Support a reviewed full extraction after the representative mappings are verified.

Keep the raw asset index, source bundles, original textures, and converted game artwork outside the public repository. Suitable local roots are `%LOCALAPPDATA%\UmaBuildAdvisor\assets\ja` on Windows and `~/.local/share/uma-build-advisor/assets/ja` on the Pi. Introduce a configurable asset root rather than hardcoding a user's machine path. Add ignore coverage if any staging output is located inside the checkout. Transfer reviewed runtime derivatives to the Pi through the existing private host-access workflow; do not transfer them through public Git commits.

Produce optimized, appropriately sized WebP/PNG derivatives: small icons, support-card thumbnails, and a larger trainee image. Preserve transparency and aspect ratio. Avoid full-resolution source textures when a small thumbnail answers the UI need.

Write a generated asset manifest keyed by `(server, catalog kind, exact catalog ID, variant)`. Include available/missing/unresolved status, relative derivative path, MIME type, dimensions, encoded file size, derivative SHA-256, source build/hash, and a documented source mapping. Keep local absolute paths out of public metadata. Report coverage and unresolved mappings without making claims about the user's owned collection. Make reruns incremental using source hashes and write candidates/manifest replacements atomically.

The image index is derived rendering metadata. Do not modify `profiles/<server>/current.json`, import inventories, create another current-progress store, or alter game-stat catalogs merely to add art.

## Deliver images through MCP

The ChatGPT iframe cannot load `C:\...`, `file://...`, Pi-local paths, or `http://127.0.0.1` images. A private MCP tunnel is not an arbitrary HTTP image origin.

Prefer a read-only, app-visible image resolver/tool called by the existing MCP Apps UI bridge after it receives the recommendation. Resolve trusted asset IDs on the server from explicit server/kind/catalog ID/variant; the language model should not supply image URLs or base64. Use bounded image batches or chunks through the existing tunnel and cache the resulting visible images in the UI. An app-only tool can keep image transfers out of the model's tool workflow.

Use the installed SDK and current official guidance to implement and verify this path:

- [MCP Apps patterns: app-only tools and bounded binary transfer](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/patterns.md)
- [MCP Apps CSP and CORS](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/csp-cors.md)
- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

Check app-tool visibility/capabilities and the host's CSP requirements for the chosen data/blob rendering method. Use explicit supported metadata and verify it in ChatGPT web and native mobile; do not assume a browser-only prototype proves the host bridge works.

Keep every complete serialized response below the existing 900 KiB application budget, allowing for base64 expansion, JSON escaping, binary fields, and `_meta` if used. `tools/response-budget.ts` currently sizes text-plus-structured compatibility replies; extend or adapt its measurement if image replies use a different envelope so no binary field is omitted from accounting. The tunnel's hard ceiling is 10 MiB, including its envelope. Do not put the full asset catalog, all image bytes, or repeated image copies in `inventory.get_profile`, ordinary model-facing results, or the HTML resource.

Resolve paths from the manifest under the configured asset root. Reject arbitrary filesystem paths, traversal, and symlink escapes. Restrict image variants/MIME types and cap decoded dimensions, encoded file size, batch size, and concurrent reads. Handle missing/corrupt images explicitly without breaking the recommendation.

## Update the existing UI

Relevant files:

- `mcp-server/src/apps/build-view/app.tsx`: recommendation parsing, trainee header, and six support tiles.
- `mcp-server/src/apps/build-view/styles.css`: current responsive styling.
- `mcp-server/src/tools/build-view.ts`: MCP App resource and presentation tool.
- `mcp-server/src/types/recommendation.ts`: strict presentation schema and complete text fallback.
- `mcp-server/src/config.ts`: runtime roots/configuration.
- `mcp-server/src/repositories/`: existing cached catalog/profile readers; reuse rather than reinterpret their facts.
- `mcp-server/src/tools/response-budget.ts`: bounded reply handling.
- `mcp-server/vite.config.ts`: single-file UI build.

Add support artwork to each of the six tiles, and an exact-outfit icon plus a larger portrait/card image to the trainee header. Keep identity, ownership, limit break, effects, reasons, sources, and complete chat text readable when images are loading, unavailable, or blocked. Use meaningful alt text, reserved dimensions, appropriate object-fit behavior, and responsive sizing. Cancel obsolete image requests when recommendations change; release blob URLs/resources on replacement/unmount. Avoid changing the established layout beyond the image additions.

Prefer resolving assets from existing recommendation IDs after receipt, preserving the current presentation schema and compatibility with older callers where possible. Do not add model-authored image fields when the server can resolve exact IDs. Keep exactly six support slots and the existing refine/compare actions.

Vite currently inlines assets into one HTML resource: do not import the entire artwork directory or bundle every image as data URLs. Load only images needed for the current view through the selected bridge path. Retain the v0.3.0 caches, compact manifests, targeted inventory queries, and batch reads.

## Build, deploy, and verify

Follow `AGENTS.md`: do not add permanent tests unless the user asks. Run the full build from `mcp-server` with `corepack pnpm build` and meaningful direct smoke/visual checks. Verify extraction determinism, image decoding/dimensions, exact-ID mapping, missing-asset fallback, Global separation, response size with base64 included, and that canonical private profiles are unchanged. Measure first/cached image loads and UI/resource sizes; do not regress the optimized data-tool paths.

Deploy through the existing Pi service and package workflow, backing up its current bundle first. Synchronize the rebuilt server and UI into the tracked packaged runtime. Bump affected versions, preserve the existing registered app/tunnel binding and private plugin identity, and update the same account plugin only as needed for new tool/UI metadata or instructions. Refresh the existing ChatGPT MCP connection after schema/resource changes; do not create another connection to repair stale metadata.

Verify the running service and tunnel separately from local stdio smoke checks. In ordinary ChatGPT web and the target native mobile client, confirm image-tool completion, six correct support images, correct trainee icon/portrait, no CSP/bridge errors, readable placeholders, narrow layout, and unchanged text fallback. Record observed results and remaining gaps in the canonical status file. Do not claim either client's image rendering from local resource reads alone.

Deliver the extraction command and usage, asset-mapping/provenance report, server/UI changes, measured payload sizes and load times, deployment status, and client verification evidence. Keep converted artwork, private inventory, local source databases, credentials, and deployment identifiers out of the public repository.
