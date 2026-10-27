# Current handoff status

Updated: 2026-10-27

This is the canonical project progress record. Other handoff files should link here rather than maintain competing status or task lists. Private deployment identifiers belong only in the private repository's deployment reference.

## Objective and boundaries

Run Umamusume Build Advisor on the Raspberry Pi through the existing private OpenAI Secure MCP Tunnel. Verify tools and the Build View separately in ordinary ChatGPT web conversations and the target native mobile client. Preserve the existing plugin, tunnel, and separate public catalogs/private profiles. Do not deploy the optional Actions API or public ingress for this workflow.

The Japanese catalog remains incomplete for event-choice/reward outcomes. The Global catalog remains `source_unavailable`. Direct MCP reads confirm an available Japanese profile and a missing Global profile; missing means unknown ownership. Each server's sole current inventory is `profiles/<server>/current.json` in the separate private repository. Imports are candidates until deliberately synced; raw exports and history are provenance, not competing current profiles.

## Deployment and plugin

- Raspberry Pi: Debian 13 ARM64, Node.js 22, official `tunnel-client` v0.0.16. Public checkout `~/Sources/uma`; private checkout is the separate sibling `~/Sources/uma-private`. Exact deployment identifiers remain private.
- The runtime credential is installed in a protected root-owned file. Do not read or print it. The existing tunnel service is enabled, active, ready, and polling the control plane.
- The service now uses `Restart=always`. A deliberate clean daemon exit was followed by an automatic restart with a different process ID and restored readiness/polling. Boot enablement was checked; a host reboot was not performed.
- The existing private USER-scoped account plugin was updated in place to **0.4.3** on 2026-10-19. Its registered connection reference and MCP tunnel binding remain unchanged. The Pi runtime serves the 0.4.3 bundle from the packaged path configured by the existing tunnel profile. Direct MCP SDK discovery confirms fourteen tools and the updated Build View resource; source changes remain uncommitted.
- The account package uses remote tunnel/app bindings; the source package retains its local stdio configuration. No public endpoint or Actions API was deployed.

## Diagnosed failures and repairs

The account package originally lacked the registered ChatGPT MCP connection reference. The user registered the existing tunnel connection; its verified `.app.json` binding is now included in the same advisor plugin. The packager requires both a verified tunnel ID and registered raw app ID and keeps them out of public source.

The subsequent web attempt stopped at `inventory.get_profile`. The former reply was **15,198,335 bytes**, exceeding the SDK/tunnel **10,485,760-byte** limit. An SDK client reproduced `ReadBuffer exceeded maximum size of 10485760 bytes`. The tunnel daemon then exited cleanly, which the former `Restart=on-failure` policy did not recover.

The inventory MCP reader now derives a compact projection from the same canonical profile, omits raw import copies, retains normalized support/trainee ownership, and pages veterans. Default page size is 25; requested limits are 1–100, subject to the **900 KiB** full-reply budget. Follow `pagination.veterans.next_offset`; a partial page is not the full veteran collection. Stored profiles, original exports, and history were not changed. The plugin skill documents this behavior.

The Build View's complete text fallback now includes alternatives, assumptions, support details, legacy factors, and evidence dates. During the 0.3.0 performance repair, the UI asset itself was unchanged.

## Verification evidence

- Full project build and TypeScript checks passed, including UI and server bundles.
- An actual MCP SDK client initialized the deployed v0.3.0 bundle, discovered thirteen tools, read both servers' manifest/profile statuses, exercised the three new tools, searched/read catalog records, and rendered a diagnostic recommendation with exactly six slots. It read the unchanged UI resource and complete text fallback without protocol errors. This fixture was not a researched build recommendation or a ChatGPT UI test.
- Pagination reached every stored veteran without omissions or duplicate IDs, preserved normalized support/trainee ownership, and left the source profile hash unchanged. Maximum measured v0.3.0 reply: **920,796 bytes**, below the **921,600-byte** budget.
- Runtime readiness, control-plane polling, service enablement, and automatic recovery from clean exit passed. Doctor passed using an ephemeral health-listener port to avoid the running daemon's listener.
- Published plugin readback confirmed version 0.3.0, unchanged registered app and tunnel binding files, private USER scope, preserved presentation/default prompts, and new-tool workflow instructions.
- On 2026-10-19, the user confirmed the repaired v0.2.3 ordinary ChatGPT web retry succeeded: the inventory call finished and the embedded Build View appeared. This is user-observed client evidence; no conversation transcript or inventory contents were collected.
- On 2026-10-19, the user separately confirmed v0.2.3 worked in the native ChatGPT mobile app: plugin selection, Japanese inventory tool completion, and the embedded Build View. This is user-observed client evidence; the specific mobile OS/app version and conversation transcript were not collected.

## Acceptance result and limits

The v0.2.3 connection/oversized-response repair was verified by the user in ordinary ChatGPT web and their native mobile client. The same private account plugin has since been updated in place to 0.4.3; the local Pi service runs its matching MCP bundle, and the existing tunnel is active, ready, and polling. Fresh ChatGPT web/mobile checks of the 0.4.3 Build View are pending: refresh the existing MCP connection, open a new advisor conversation, and confirm the updated view appears. Do not ask for another key or create another plugin/tunnel.

Detailed strategy quality, current-source citations, and exact support-slot contents were not independently inspected; do not imply those received a separate review. Client confirmation applies to the user's tested clients, not every mobile OS/app version. Catalog coverage limitations remain as documented above.

## Performance review: 2026-10-19

Read-only review of account plugin v0.2.3 and the deployed server bundle. Sequential local MCP SDK calls on the Pi, with a warm filesystem, measured median times of 11 ms for a support record, 29 ms for exact-ID support search, 39 ms for the sampled skill search, 63 ms for the Japanese manifest, 402 ms for the default inventory page, and 2,992 ms when requesting 100 veterans. Samples were 12 calls each, except five for the 100-veteran case. These exclude the hosted tunnel, ChatGPT reasoning, web research, and client rendering; they are not a concurrency benchmark.

The inventory page-sizing loop performed 140 serializations in one 100-veteran request, spending approximately 2,480 ms serializing. Every inventory call also rereads/parses the full stored profile. The measured manifest reply was 1,176,380 bytes; a separate projection comparison removing only `generated_files` reduced a similarly shaped reply from 1,176,194 to 13,050 bytes. The complete compatibility inventory reply measured 773,222 bytes at the default page size. Catalog readers have no application cache and search rereads the manifest twice and loads matched records sequentially.

Recommended order: compact manifest; efficient byte-budget pagination; file-version-aware per-server caches; targeted inventory queries and bounded batch catalog reads. Keep TypeScript/Node and the existing private tunnel. Consider a rebuildable SQLite query index only if richer filtering warrants it; it must remain derived from the canonical public catalogs and separate private profiles, never become another editable progress store. A language rewrite has no measured justification. No production code, plugin package, service configuration, or inventory was changed for this review. The live tunnel remained ready afterward.

## Implemented optimizations: v0.3.0

The user authorized all five recommended changes, which are implemented without new dependencies or a language/database migration:

- Compact MCP manifest omits only the maintenance file list; the full source manifest is unchanged.
- Byte-bounded contiguous pages use binary search rather than repeated single-record removal.
- A bounded in-memory parsed-file cache checks source device/inode, size, and nanosecond modification/change times on every access, coalesces concurrent loads, and retries files changed mid-read. Compact profile projections are memoized against the parsed source object. No second progress file or database is created.
- `inventory.get_summary` reports small profile/section status metadata. `inventory.query_records` selects one section by IDs/name and relevant support/veteran filters, with summary/full veteran details and explicit unknown-section/pagination states. Existing `inventory.get_profile` remains supported.
- `reference.get_records` reads up to twenty ordered requests with bounded concurrency, per-record availability, and byte-budget continuation. Search reuses its manifest, resolves exact names directly, and reads result records in groups of eight.

The full build/typecheck and direct smoke checks passed. Temporary fixtures outside the repository verified cache refresh after same-size/same-mtime writes, atomic replacement, deletion, invalid JSON repair, and concurrent loads; inventory filters and unknown versus empty sections; and batch continuation, maximum request count, and explicit oversized-record failure. The production profile was not changed. No permanent test files were added.

Comparable sequential local MCP SDK medians (twelve samples, except five for a 100-veteran request):

| Operation | Before | v0.3.0 |
| --- | ---: | ---: |
| Japanese manifest | 63.28 ms | 6.22 ms |
| Exact-ID support search | 28.55 ms | 3.16 ms |
| Sample skill search | 38.99 ms | 10.27 ms |
| Support record | 11.36 ms | 3.89 ms |
| Default inventory page | 402.24 ms | 73.02 ms |
| Requested 100 veterans | 2,991.53 ms | 252.04 ms |

The manifest reply shrank from 1,176,380 to 13,236 bytes. Warm targeted tools measured 5.79 ms / 758 bytes for inventory summary, 2.65 ms / 1,228 bytes for one selected owned support, 11.41 ms for the default veteran summary page, and 19.77 ms for a six-support catalog batch (twelve timed calls following warm-up). These are local single-client measurements, not hosted ChatGPT/tunnel latency or a concurrency/load guarantee. The first profile read still pays the source read/parse cost; the default inventory benchmark's maximum/p95 sample was approximately 489 ms.

Do not recreate the plugin/tunnel, ask for another runtime key, or infer web/mobile UI success from local smoke checks. Consult `docs/local-plugin-setup.md`, `docs/mobile-chatgpt-setup.md`, and the private deployment reference for procedures and identifiers.

## Build View redesign: selected layout 2

The user selected the dark six-card horizontal layout, introduced in 0.4.0 and retained in 0.4.2. The first screen now has a compact trainee header, a six-card Support Deck, ownership status, role colors/icons, a target summary, and a Refine build control. Support art uses the runtime-only full portrait variant at 3:4 rather than the square card derivative. Card explanations, levels, effects, useful skills, confidence, trainee rationale, inheritance, priorities, alternatives, assumptions, and dated sources remain accessible in expandable details. The chat response still carries the full text fallback.

The six training-type icons (including the pink Guts icon) are from Euophrys' `umamusume-tierlist`; the public repository and package include the required MIT notice, and the view shows a compact attribution. No installed-game artwork was copied into the repository. Global artwork remains unavailable unless separately verified assets are installed; no Japanese assets are substituted for Global.

Verification: `corepack pnpm build` passes TypeScript checks and produces the MCP server, UI, and Actions bundles. A local MCP SDK smoke client discovers fourteen tools and reads the Build View resource, including the bundled stat icons and 3:4 CSS. Chromium screenshots of a synthetic layout fixture were reviewed at 1400×890 and 390×844: six cards fit one desktop row, the mobile view uses two columns without horizontal overflow, and Guts is pink. The fixture used local image derivatives only for visual QA; it was not a recommendation, did not read the private profile, and did not change inventory data. No permanent tests were added.

Deployment completed locally on the Raspberry Pi on 2026-10-19. The live tunnel profile points to `plugin-package/uma-build-advisor/mcp-server/dist/`; the 0.4.0 server and UI bundles were copied there after backing up the prior files under `~/.local/state/UmaBuildAdvisor/backups/deploy-v0.4.0-20261019/`. Both deployed SHA-256 hashes match their build outputs. The existing tunnel service restarted successfully and is active; tunnel-client health reports live, ready, and a successful control-plane poll. An MCP SDK smoke against the packaged runtime reports server version 0.4.0, fourteen tools, one UI resource, and passes checks for Support Deck, Refine build, 3:4 portrait ratio, pink Guts, and bundled stat icons. Read-only manifest and profile calls for `ja` and `global` through the connected Umamusume MCP tools all returned successfully; no inventory contents were displayed or modified. The existing account plugin was updated to 0.4.0 in place. Readback confirmed both manifests carry version 0.4.0 while `.app.json`, `.mcp.json`, `mcp.json`, and the skill file remain byte-for-byte unchanged; the same private USER scope is preserved. ChatGPT web and native mobile rendering of this new 0.4.0 view has not yet been rechecked; refresh the existing connection and verify those clients separately. Do not create another tunnel or connection.

## Latest repair: image loading and invocation latency (0.4.2)

The user reported missing artwork and the view being abandoned on both ChatGPT web and native mobile. The eight exact images from the screenshot resolve against the installed, reviewed asset manifest. A synthetic host rejecting standard app tool calls reproduced the placeholders. Version 0.4.1 added the ChatGPT compatibility bridge, but loaded eight images sequentially and could attempt both bridges for every image: sixteen host calls. Live connected manifest/profile reads measured approximately 6–11 seconds each, including hosted routing overhead; serial image calls could therefore dominate perceived UI latency. These timings do not measure only the Pi or tunnel daemon.

Version 0.4.2 loads the same verified artwork on the server while presenting the build and includes it once in component-only tool-result `_meta.artwork`. Artwork is excluded from model-visible text and structured content. The normal UI path makes **zero** additional image-tool calls. The shared verified image reader still checks server identity, manifest paths, dimensions, sizes, and checksums. The complete presentation response reserves room for the recommendation within the 900 KiB budget. Omitted artwork uses bounded batch continuation, with standard MCP Apps calls followed by the ChatGPT compatibility bridge only when needed; each bridge has a 15-second timeout and cancellation handling. The UI resource URI is `ui://uma-build-advisor/build-view-v0.4.2.html` to invalidate stale HTML caches. Full recommendation text, six slots, portrait proportions, ownership states, and expandable evidence remain intact.

Verification used temporary scripts only. Browser plugin not available; regular Playwright used the installed system Chromium. A controlled host with 150 ms delay per bridge attempt loaded the old deck in 4.44 seconds with eight standard and eight compatibility calls. The new deck loaded in 1.76 seconds with zero image calls; about 0.57 seconds elapsed between delivery of the tool result and the completed image check. These are local synthetic measurements, not a promise of hosted ChatGPT latency. Desktop (1400×890) and mobile-sized (390×844) renders had all eight images, six support slots, no app runtime errors, and no mobile horizontal overflow. Refine build opened and focused the follow-up control. Metadata-stripped and partial-result cases loaded the remaining artwork in one batch; independently unavailable Global art stayed unavailable without Japanese substitution. A large recommendation produced a 912,942-byte initial result, below 921,600 bytes, and fetched only its three omitted images.

The full TypeScript/UI/server/Actions build passed. Packaged runtime SDK checks report version 0.4.2, fourteen tools, the versioned UI resource, component artwork metadata, the complete text fallback, and no protocol errors. Catalog and profile reads passed for both server keys: Japan is incomplete with an available profile; Global is source-unavailable with missing/unknown ownership. Connected MCP reads for both keys also succeeded without displaying profile contents or changing stored data. The Pi bundles were deployed after backing up the prior packaged files under `~/.local/state/UmaBuildAdvisor/backups/deploy-v0.4.2-20261019-before/`; deployed hashes match the build outputs. The existing enabled tunnel service was restarted; its live, ready, and successful control-plane-poll checks all passed after the final deployment, and a connected manifest read succeeded. The existing private USER-scoped plugin is 0.4.2; account readback confirms both manifests and byte-for-byte preservation of `.app.json`, `.mcp.json`, `mcp.json`, and the skill.

Remaining acceptance: this Codex session still advertises the older ten-tool registered connection list, while the deployed runtime lists fourteen tools. Refresh the **existing** ChatGPT MCP connection so `inventory.get_summary`, `inventory.query_records`, and `reference.get_records` can replace larger or repeated legacy reads, then start new ordinary web and native mobile conversations. Actual ChatGPT web/mobile rendering and invocation latency of 0.4.2 remain unverified until observed in those clients. Fresh server-specific strategy research is still required and can contribute to end-to-end recommendation time. Do not recreate the plugin, connection, or tunnel, or request another credential.

Standing deployment preference confirmed on 2026-10-19: requested MCP/plugin changes include deploying the affected Pi runtime and updating the existing account plugin, followed by verification; do not wait for another deployment request. Both remain verified at 0.4.2 with matching runtime bundle hashes and healthy live/ready/control-plane polling. Host-side discovery refresh is a separate client cache operation; no callable refresh capability is available in this session.


## Latest repair: require Build View presentation (0.4.3)

The user reported that build suggestions often omit the MCP UI and explicitly reiterated that changes must update the existing plugin and tunnel. The existing account skill described the UI as optional ("when available") and led with a prose recommendation. Separately, direct SDK resource reads reproduced `Resource ... not found` for the original `build-view.html` and 0.4.1 resource URI; cached tool descriptors could therefore reference an address no longer served. This establishes a compatibility failure, not proof that every reported skipped view had that cause.

The account skill and server initialization instructions now require `build.present_recommendation` before the final answer for each completed or revised six-support deck. The skill distinguishes fact lookups, critical missing constraints, unknown ownership, missing art, actual tool failure, and successful presentation; it requires an explicit failure explanation instead of silently replacing the view or looping calls. Refine/Recalculate/Compare follow-up prompts carry the same presentation requirement. The tool description repeats the required final step, and its descriptor exposes both standard MCP Apps resource metadata and ChatGPT's documented `openai/outputTemplate` compatibility alias. The resource supplies a widget description. The 0.4.3 view also remains readable at all three previously published resource addresses; these are aliases to the same current view. The existing one-response artwork hydration and complete text fallback remain intact.

Built and deployed 0.4.3 to the existing Pi package after backing up prior bundles under `~/.local/state/UmaBuildAdvisor/backups/deploy-v0.4.3-20261019-before/`; deployed hashes match. Restarted the same tunnel service. Updated the existing private USER-scoped account plugin in place using a three-file overlay: both version manifests and the advisor skill. Readback confirms 0.4.3, the exact intended skill, byte-for-byte unchanged `.app.json`/MCP binding files, and unchanged presentation/default prompts aside from version. No plugin, connection, or tunnel was created or replaced.

Verification: the full build/typecheck passed; a packaged MCP SDK smoke discovered fourteen tools, verified both UI metadata links, read the current resource and all three legacy aliases, presented six slots with artwork metadata and complete text, and read both server catalog/profile statuses without displaying inventory. Temporary Playwright checks using system Chromium passed at desktop and mobile-sized viewports: all eight images, no app errors, zero follow-up artwork calls, no mobile horizontal overflow, and a Recalculate follow-up containing `build.present_recommendation`. Connected catalog/profile reads succeeded for both server keys after deployment. No permanent tests or inventory changes were added. Actual ordinary ChatGPT web/native mobile tool-choice frequency and rendering of 0.4.3 remain client acceptance checks; instructions cannot force the host to render a component. The registered connection's discovery cache may still require a client-side refresh, which available management tools cannot perform. The compatibility resource aliases mitigate stale UI addresses while preserving the existing connection.


## Japanese catalog refresh (2026-10-27)

The current Windows Japanese Steam install supplied the refreshed master database and Hachimi text data. Source hashes are recorded in data/ja/manifest.json: master 5025d7cf8a448d6edfdc54ece62e472e5d249c36c4373252a830a2619e82b47d; text data e4b09f974080b0441d1040536cc7202ddab474088bb68707a26337f0495695d1. The production validator accepted the candidate with the existing coverage limitation: event choice/reward data is unavailable for 18,404 records. The Japanese catalog now has 566 support cards, 272 trainee outfits, 2,223 skills, 18,404 events, 15 scenarios, 2,924 races, 140 courses, 119 conditions, and 2,649 factors. Support and trainee IDs each reconcile fully with their versioned GameTora feeds.

The reviewed catalog was published as 919ae484 in the public repository. The Raspberry Pi tunnel service remained active and its connected manifest read returned the refreshed catalog. The private Japan profile was refreshed separately in the private repository; ownership details remain there. Temporary game-source staging and the one-time game-root config were removed after verification. The Pi remains without a configured local game root.

## Japanese artwork cache refresh (2026-10-27)

The Pi artwork cache now matches the refreshed Japanese catalog. Its manifest has 2,242 asset keys, with 2,018 available derivatives and 224 unresolved mappings; eleven keys were added and no previously available derivative regressed. The candidate was generated from the installed Japanese game and the current public catalog. Its master database hash matches the Japanese catalog manifest.

The extractor now preserves decoded artwork aspect ratios. The Build View already contains images with object-fit contain, so square full-art textures render without being stretched into the portrait frame. The reviewed update validated file sizes, SHA-256 values, WebP formats, and dimensions for all 2,018 available derivatives. The Pi manifest was replaced atomically after staging the new files; the previous manifest is backed up under the private state backup directory. The Windows artwork cache was refreshed separately with its own rollback manifest. No game files, catalog records, inventory profiles, or public artwork files were changed.

The existing tunnel service remained active. The existing USER-scoped account plugin remains at 0.4.3; the currently installed runtime already contains the image resolver, so this data-only refresh did not require a new plugin release or service restart. This Codex session still exposes the older ten-tool discovery list; host-side MCP discovery refresh remains a client-side step unavailable through the current management tools.
