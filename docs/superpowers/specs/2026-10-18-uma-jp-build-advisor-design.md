# Umamusume Build Advisor — Design Specification

**Status:** Approved; ChatGPT web plugin, mobile compatibility check, and 64-bit Raspberry Pi hosting added
**Date:** 2026-10-18

## 1. Purpose

Build a private ChatGPT plugin for useful, evidence-backed Umamusume build advice across the Japanese and Global servers. It must work through ChatGPT chat and provide an interactive in-ChatGPT interface that visually presents suggested trainees (runners), support cards, legacy candidates, and alternatives. A response that only lists IDs is not sufficient.

The plugin reads game facts and supported collection data from the project repositories. It uses current community research to choose builds and explain strategy, but it must not treat web pages as a substitute for missing or stale catalog records. A local MCP service maintains access to both repositories: a data updater reads the installed game data, while inventory adapters accept GameTora collections and compatible formats. ChatGPT web reaches the service through a remote plugin and OpenAI Secure MCP Tunnel; the private repo and local game install are not exposed as public services. Native mobile MCP App availability is a platform compatibility item to verify; current Help Center documentation says custom MCP apps are web-only.

## 2. Decisions and requirements

- Maintain two repositories: a public reference-data repository and a private inventory/progress repository.
- Keep Japanese and Global data separate in both repositories.
- The reference repository is the canonical source for all static game facts used by the plugin. The plugin reads these records and does not reconstruct its game database from live websites.
- Use the currently installed Japanese game data as the first supported source for building and refreshing the Japanese reference catalog.
- Provide an update pipeline that can refresh reference data from a local Umamusume install, validate the result, and publish a versioned catalog update.
- Provide inventory refresh paths from an opt-in Hachimi Edge exporter or another verified local exporter, and from GameTora collection exports. Support GameTora’s single **Everything** JSON format.
- The plugin reads the saved inventory profile from the private repository or uses an explicitly supplied chat attachment for the current conversation. Inventory is never written to the public repository.
- Keep the whole advisor usable in ChatGPT chat; do not build a separate public website UI.
- Support ChatGPT web chat through a remote MCP plugin, with the private server reached through Secure MCP Tunnel. A local `stdio` connection without the tunnel is only for compatible local hosts; the machine running the tunnel client must remain online during use. Verify native mobile availability independently; if unavailable and mobile chat access is required, use the separate optional GPT Actions text route.
- Support hosting the same bundled MCP service and tunnel on Windows or 64-bit Raspberry Pi Linux. Raspberry Pi hosts can read and sync repository data but cannot refresh catalog data from the Windows game install.
- Show recommendations in an interactive ChatGPT-embedded interface, with a complete text response as a fallback.
- For every build recommendation, check current community sources, including newly found relevant sources, and prioritize Japan-specific research for Japanese-server advice.
- Inventory syncing may run automatically after the user explicitly configures a private destination. Public reference-catalog publication remains a separate, reviewable update operation.

## 3. System boundaries

### Canonical data and read path

The public repository stores versioned, server-separated static reference data. The private repository stores server-separated user inventory and progress. At runtime, the ChatGPT plugin/MCP tools read from these repositories and return only the records relevant to the user’s question and the interactive build view.

The plugin may search the live web for strategy evidence and recent community advice. It must use the versioned repository for card, trainee, skill, scenario, race, effect, and availability facts. If a needed game-data fact is absent, conflicting, or outdated in the selected catalog, the assistant reports the gap and requests or performs a catalog refresh through the maintenance workflow; it must not guess the missing fact from an unrelated guide.

### Data maintenance paths

Reference catalog maintenance and inventory maintenance are separate:

1. **Reference refresh:** a local updater reads the installed game data and translation files, produces a validated catalog in the local repository working copy, and reports added, changed, missing, and unresolved records. A user-reviewed update operation publishes the versioned result to the public repository. ChatGPT then reads the published catalog.
2. **Inventory refresh:** a Hachimi Edge plugin or other verified local exporter can update a local inventory export automatically after setup. A GameTora Everything export can also be imported on demand. A normalizer validates either source and writes the selected server snapshot to the private profile. Once the private destination is configured, the profile may sync automatically to the private repository.
3. Both paths must preserve Japan and Global as independent data. No account inventory or progress is written to the public reference repository.

The local game updater/exporter does not require ChatGPT to inspect account save databases or to access the game process from a hosted service. It creates local artifacts that can be validated and synchronized through the configured repository workflow. Use the Windows game install for Japanese catalog refresh; a Raspberry Pi MCP host serves the latest published repository catalog and private inventory.

Use the MCP maintenance tool for invoking or reviewing local refreshes when the local service can reach the game files and the connected ChatGPT account permits the requested tool action. Secure MCP Tunnel lets ChatGPT reach the private MCP service without a public server. Do not assume a remote ChatGPT plugin can read a Windows game directory directly. Its embedded view must use the MCP Apps standard and responsive layouts, while native mobile availability remains a separate platform check. A local helper remains available for producing a catalog or inventory package for attachment/import in chat, followed by the configured repository sync. Custom MCP permissions depend on account/workspace plan.

## 4. User workflow

1. The user selects Japan or Global, or the selected server is detected unambiguously from the supplied inventory. If it is ambiguous, ask before combining or replacing profiles.
2. The user asks for a training deck, race/event build, trainee plan, or legacy recommendation. If server, scenario, race conditions, or goal are missing and materially affect the answer, ask only for the missing details.
3. The plugin reads the relevant static records from the public reference repository and the saved collection from the matching private profile. It can instead use a GameTora JSON attachment for that conversation if the user has not synced it.
4. The plugin performs live web research for current, server-specific community strategy and any recent scenario or event guidance. It does not use web research to fill missing static catalog fields.
5. The assistant returns one to three actionable options with card-by-card explanations, ownership and limit-break assumptions, skill coverage, substitutions, tradeoffs, source links, and freshness/confidence notes. The same recommendation is rendered in the ChatGPT build interface.
6. The user can inspect the trainee, deck, legacies, alternatives, assumptions, and evidence; compare or select an alternative; and request a recomputation after changing the target or constraints. Each recomputation is a new recommendation and must use current live research.
7. A configured local exporter can refresh its local inventory output automatically. A configured private sync can then update only the matching server profile. GameTora JSON imports follow the same validation and private-profile path. Reference-catalog publication remains separate and reviewable.

## 5. ChatGPT plugin, MCP, and in-chat interface

### ChatGPT plugin behavior

Create a private ChatGPT plugin with a domain-specific skill and MCP tools. The skill will instruct the model to:

- use repository records as the source of truth for static game data and inventory state;
- determine the target server from the user’s request or selected inventory and never mix the two server profiles;
- search the live web for current build strategy before each recommendation, including relevant sources not previously indexed;
- distinguish repository facts, community strategy claims, and the model’s own inference;
- explain recommendations in plain language, cite sources near the relevant claims, and disclose thin, missing, or stale evidence;
- return structured recommendation records to the ChatGPT interface and keep the accompanying chat answer complete;
- use read-only repository access during ordinary advice; route catalog and inventory changes through their respective maintenance flows.

### Interactive build interface (MCP App)

Implement the interface as an MCP App rendered by ChatGPT, invoked with a build recommendation and available as a conversation-level build view. It is an extension of the chat workflow, not a standalone public website. The app view and assistant message use the same structured recommendation payload so facts, ownership labels, assumptions, and sources remain consistent.

The interface provides a compact recommendation view in the conversation and a larger interactive build-planner view associated with that conversation. It renders the recommendation returned for that thread; it must not silently load or merge another server’s profile. If MCP Apps are unavailable in a client or disabled, the assistant still gives the full recommendation in ordinary chat text.

The build view should show:

- **Build context:** server, scenario/version, target race or event, distance, surface, running style, goal, and date live sources were checked.
- **Recommended trainee/runner:** outfit and character, growth rates and aptitudes relevant to the target, unique/evolved skills, and the reason this trainee suits the build.
- **Support deck:** six slots, including a friend/rental card when used. For each slot show card name, rarity/type, owned or borrowed status, owned limit break and effective level when known, slot role, relevant effect/unique-effect breakpoint, key hint/event skills, and a concise reason for the choice.
- **Legacies:** suitable owned parent/ancestor candidates, relevant factors, sparks or inheritance skills when available, and traits desired for a new legacy. Do not invent factor ownership where the inventory lacks it.
- **Build priorities:** stat priorities, skill recommendations and activation conditions, key training or race assumptions, and significant compromises.
- **Alternatives:** substitute cards or trainees drawn from the user’s actual collection, with a concise comparison of what improves or weakens when swapped. Mark unowned or rental options clearly.
- **Evidence:** clickable source links with source name, publication/update date when available, server and scenario/race context, retrieved date, and confidence rationale. Separate repository game-data facts from community advice and model inference.

The user can inspect card and trainee details, compare the primary build with alternatives, choose a different owned trainee or legacy candidate, and adjust material constraints such as scenario, race, running style, or rental availability. A selection either updates the recommendation through the relevant MCP tools or places a clearly described request in the current chat for the model to recalculate. The interface must not present stale recommendations as recalculated results. Recalculation triggers live source research for its target server and goal.

The view must be responsive and accessible across supported ChatGPT clients: keyboard-operable controls, readable labels, text that does not depend on color alone, and useful text alternatives for visual assets. Use card artwork only when a permitted asset source is established; otherwise render a clear card identity with text and non-infringing visual cues. All material shown visually must also be available through text and source links.

The interface does not independently store account data or publish it. It renders data from the current conversation and repository read path. Reopening or refreshing the view must not create a second inventory profile or apply an unrequested profile change.

The interface design follows the current [OpenAI MCP Extensions specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) and its [MCP App UI patterns](https://github.com/openai/mcp-extensions/blob/main/docs/patterns.md). The implementation must verify the relevant entrypoint, interaction path, and responsive behavior instead of assuming every client exposes identical controls.

### Repository and MCP access

Use the authenticated GitHub MCP/app connection available in ChatGPT for repository reads and, where configured, maintenance writes. Verify that the plugin can read the public catalog and private profiles without mixing their permissions. Do not put GitHub tokens in plugin files, data files, or chat.

Keep reference records addressable so the assistant can fetch relevant content instead of pulling a multi-megabyte monolithic catalog for each question. MCP tools should return structured records with server identity, source provenance, ownership/limit-break state where applicable, assumptions, and recommendation evidence.

The advice tools are read-only. Separate catalog-refresh and inventory-import/sync operations perform writes to their respective repositories. If the GitHub MCP connection cannot expose the private repository or cannot safely scope writes, provide a local import/export workflow and report that remote private sync is unavailable; do not add a hosted backend without a concrete need.

### Repository layout

The public repository has independent server trees:

- **data/ja/** for Japanese game data, translations, mappings, and Japanese-server reference notes;
- **data/global/** for Global game data, translations, mappings, and Global-server reference notes;
- shared schemas, update scripts, provenance, source-index formats, and coverage manifests.

The private repository has independent server trees:

- **profiles/ja/** for Japan inventory snapshots and Japan-specific saved progress;
- **profiles/global/** for Global inventory snapshots and Global-specific saved progress.

Each profile records server, source format, import/export time, schema version, and unresolved IDs. Versioned updates allow a prior inventory to be recovered. Unknown or ambiguous IDs are reported rather than silently mapped to the wrong card.

## 6. Reference catalog and completeness

### Japanese reference data source

Use the currently installed Japanese game data as the source of truth for static game facts where available. The current local catalog draft has 563 support-card rows and 271 trainee-outfit rows, with support effect values by level, unique-effect records, release metadata, and GameTora links. It has known gaps, including support hint and event skill relationships not linked in the extracted master tables. The current draft is therefore not yet complete and is not a release-ready data source for the plugin.

The local refresh pipeline reads the installed master database and Hachimi translation data, preserves Japanese names, uses readable English text where available, and records source file hashes and generation time. The updater must extract all relevant connected tables and local game files needed for complete support-card, trainee, skill, event, scenario, race, and legacy reference data. It must not stop at the currently extracted card and effect tables.

### Required game facts

The catalog must contain, where present in the installed server data:

- every support card available or represented in the server dataset, with internal game ID, exact GameTora ID/URL mapping, name/title/character, rarity/type, server availability, release date, effect curves by level and limit break, unique-effect thresholds and components, and all associated skills;
- each support card’s hint skill pool, hint levels, training-event chain, event choices and outcomes, skill rewards, stat/energy/motivation effects, and event-specific unlock conditions;
- every trainee outfit/variant, with internal IDs, GameTora mapping, character, rarity/availability, growth rates, aptitudes, unique and evolved skills, skill unlock/awakening levels, objectives, and career-event effects;
- each skill’s exact name, description, activation conditions, target/race context, cost/effect parameters, evolution links, and source/unlock path;
- scenarios and mechanics, race/course parameters, career requirements, inheritance factor types/effects, balance changes, and release/version context needed to explain recommendations;
- Japanese originals and English translations when available, plus source provenance for every translated or derived field.

If a fact is not present in the installed files, the data pipeline must identify an approved authoritative source or explicitly record that field as unavailable. It must not infer or fabricate it. Web search is reserved for current strategy and for locating/validating sources to add through the catalog-maintenance pipeline; build-advice runtime does not use a web page as an untracked replacement for a missing catalog record.

### Completeness and update validation

Each generated catalog includes a manifest with source build/version, source hashes, generation timestamp, entity counts, field-coverage counts, unresolved links, and known unavailable fields. Before publication, validation must confirm that:

- source tables and files required for the declared catalog scope were found and parsed;
- every source support card, trainee, and skill record in scope has a canonical record or a documented reason for exclusion;
- card-to-skill, event-to-reward, trainee-to-skill, and GameTora mappings resolve or appear in an explicit unresolved report;
- localized values retain Japanese source text and identify translation provenance;
- server availability is based on that server’s data rather than inferred from another server.

“Complete” means full coverage of the declared static-data scope from verified sources, with only explicitly documented unavailable fields; it does not mean inventing data where the client contains none. Do not publish a catalog as complete when required records or relationships are missing. The plugin must disclose incomplete/stale manifests and avoid making claims that depend on missing fields.

### Global reference data

Global data lives separately and must be based on a verified Global source. Do not infer Global availability, release dates, translations, effects, or balance values from the Japanese dataset. The current workspace has a Japanese install, so the initial Global source and its provenance must be established before claiming complete Global coverage.

## 7. Inventory and progress refresh

### Supported inputs and export adapters

Support two primary inventory update routes:

1. **Hachimi Edge or another local exporter:** an opt-in plugin/adapter captures owned support cards, trainees, limit breaks/levels, and veterans/legacies from the local game and writes a local normalized export. If technically reliable, it can refresh that export automatically after game data is available. Hachimi Edge is a candidate platform, not a guaranteed exporter; prove that the chosen adapter can capture all three sections and preserve ownership state before treating it as complete.
2. **GameTora collection:** accept GameTora’s Everything JSON export as the preferred manual interchange format. Preserve the original JSON, detect the Japan or Global server key, and normalize trainees (**charCards**), supports, and veterans/legacies without dropping unknown fields. Also support per-section exports where Everything is unavailable, while clearly reporting omitted sections. GameTora currently exposes an Everything export from its collection tracker; keep the importer aligned with the format it actually exports.

Keep adapter formats extensible so another verified export tool can be added without changing the canonical profile schema. Export/import summaries show counts, unresolved IDs, missing sections, and any stale or unsupported fields.

### Local and private profile updates

The local exporter produces an inventory file on the user’s device and makes no network requests for account data. A normalizer maps it to the selected private profile schema using the public catalog’s canonical IDs. The private repository is the canonical saved inventory source; the public catalog never receives user collection data.

After the user configures the authenticated private-repository destination, an automatic exporter may sync refreshed inventory to the matching private server profile. GameTora imports can update the same profile through the ChatGPT/MCP maintenance workflow or a local sync tool. Show the destination and affected server/profile in the setup and provide a way to review, pause, or disable automatic sync. No progress update may be sent to a public repository or unrelated service.

The plugin reads saved profile data from the private repository. If no profile is available, it can use a user-attached GameTora JSON for the current chat and state that the profile was not saved. The Japan client must never be used to infer Global ownership.

Do not access account save databases for this workflow. Any process that reads live game state or hooks game responses must be documented as community tooling, tested against the current game/Hachimi version, and described with its compatibility and operational limits. Do not claim official support or guaranteed safety.

## 8. Build advice behavior

The plugin uses the user’s actual collection rather than a fixed tier list. Depending on the request and available data, it considers:

- server, scenario/version, race/event, course, surface, distance, running style, and competition mode;
- trainee growth rates, aptitudes, unique/evolved skills, skill unlocks, and career objectives from the catalog;
- owned support-card limit breaks, level/effect breakpoints, training types, hints, event skills, event outcomes, and scenario roles from the catalog;
- user-owned trainees and veterans/legacies, including relevant inheritance factors, sparks, and skills;
- a friend/rental card if desired, clearly labeled as borrowed rather than owned.

The answer should normally include:

1. The proposed trainee and deck, with the purpose of each slot.
2. Why each card fits this trainee, scenario, and target race, including relevant effects, hint/event skills, and limit-break assumptions.
3. Stat and skill priorities with the catalog fact, live source, or calculation behind them.
4. Substitutions using the user’s actual collection and what changes when a card is swapped.
5. Relevant owned legacy candidates and desired factors when inheritance is in scope.
6. Main compromises, confidence, and citations to current advice and repository facts.

Show the same details in the text answer and interactive build view. Do not invent stat targets, event results, skill unlock paths, or activation values. If the repository manifest is incomplete or relevant sources disagree, disclose the gap and avoid false precision.

## 9. Live research and source policy

Live research is required for each build recommendation. Search the target server, current scenario/race, and relevant Japanese-language terms, and check for newer or newly discovered sources rather than relying only on cached research.

Initial Japan-specific candidates include Umamusume Labo’s scenario and Champions Meeting analyses, Japanese Reddit discussions, and relevant current Japanese blogs or community analyses. Assess each article’s suitability at the time of use; a source’s existence does not make every recommendation reliable.

Use sources in this order:

1. The versioned repository catalog for static card, trainee, skill, scenario, race, and availability facts; the installed game data and official announcements are sources for catalog updates and exact changes.
2. Recent, Japan-specific community analysis that names its scenario/race, explains its reasoning or testing, and is corroborated where possible.
3. Player reports and Reddit discussions as leads or context; label anecdotal advice and seek corroboration for important claims.
4. General guides such as uma.guide for transferable mechanics, not as proof of current Japan-server meta.
5. Game8/GameWith only when the relevant advice is independently corroborated or gives verifiable reasoning.

For every cited community claim, preserve the URL, publication/update date when visible, server, scenario/race context, retrieved date, and confidence rationale. If live search finds no recent relevant evidence, say so and keep the recommendation tentative rather than filling the gap with stale or weakly supported advice. The interactive view links to the same evidence that supports the chat answer.

## 10. Updating and persistence

- A local reference-data generator refreshes versioned catalog files from the installed Japanese game data and translation bundle. It produces a coverage report before publication.
- A separately verified Global data source feeds the Global catalog; JP data is never copied into Global as if current.
- Reference updates are reviewed and published to the public repository as explicit catalog-maintenance operations.
- A configured local inventory exporter can automatically refresh a local file; a configured private sync updates only the matching server profile.
- GameTora Everything JSON and per-section exports can be imported into the same private profile path.
- The private repository keeps versioned snapshots so prior inventories can be recovered.
- No public catalog update includes user inventory, and no automatic sync sends account data to a public repository.
- Users can pause or disable automatic inventory sync and use a chat attachment without saving it to the private profile.

## 11. Acceptance criteria

The design is complete when the implementation can demonstrate that:

- the private ChatGPT plugin works in chat without a separate user-facing site;
- the plugin reads all static game facts from the selected versioned repository catalog and inventory state from the selected private profile or current chat attachment;
- the catalog contains complete supported Japanese records for cards, trainees, skill unlocks, effects, events, and other required build facts, with a validated coverage manifest;
- the currently installed Japanese game data can refresh the local catalog and produce a reviewable update for the public repository;
- Global data is separately sourced, versioned, and never inferred from JP;
- an opt-in local exporter can refresh the user’s supports, trainees, and veterans/legacies, or the user can import those sections from GameTora Everything JSON;
- automatic private-profile sync can be configured, reviewed, paused, and limited to the correct server; no inventory is written to the public catalog;
- support cards resolve to exact GameTora IDs and expose useful effects, skills, events, unlocks, and availability from the catalog;
- a ChatGPT-embedded interface presents the suggested trainee, six support-card slots, legacy candidates, alternatives, priorities, and linked evidence;
- the build view and chat answer agree on server, ownership, limit-break assumptions, recommendations, and sources;
- users can inspect and compare alternatives and request recalculation after changing the goal, with fresh live research for each new recommendation;
- the interface remains usable on supported ChatGPT clients and provides a complete text fallback when the app view is unavailable;
- build advice combines the repository catalog and actual owned collection with live, server-specific strategy research and explains card-by-card reasoning.

## 12. Open implementation checks

These items must be resolved before claiming completion:

- verify GitHub MCP access for the public catalog and private inventory profiles, including permission-scoped reads and writes;
- establish a verified Global catalog source;
- inspect all installed Japanese source tables and bundles needed to close the known hint/event/skill gaps in the current catalog draft;
- validate the exact GameTora Everything schema with populated Japan and Global examples;
- determine whether Hachimi Edge can reliably export supports, trainees, veteran/legacy records, and ownership/limit-break states; compare it with other local exporters if coverage is incomplete;
- verify local exporter and automatic sync behavior on the current game version, including pause/disable and recovery;
- confirm the ChatGPT MCP App entrypoint, interaction path, and supported-client rendering;
- confirm the structured recommendation schema supports the visual trainee, deck, legacy, alternate, and evidence views without disagreeing with chat text;
- identify permitted artwork/thumbnail sources or use a text-first visual treatment.
