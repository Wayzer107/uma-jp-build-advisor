---
name: uma-build-advisor
description: Use when planning or reviewing Umamusume trainee builds, support decks, inheritance, skills, or collection updates for the Japanese or Global server.
---

# Umamusume Build Advisor

Use the repository catalogs for static game facts and the matching private profile for ownership. Use current, server-specific web research for build strategy before every recommendation. Present a complete recommendation in chat; use the interactive build view when available.

For ChatGPT web, use the connected remote MCP plugin through OpenAI Secure MCP Tunnel. The account plugin archive uses a remote tunnel binding; local `stdio` is for compatible local hosts only. If the app or tools are not connected, do not claim to have read the repositories; ask the user to reconnect the app or provide the relevant export. The host running MCP and the tunnel client must stay online during use. Native ChatGPT mobile availability for custom MCP apps depends on current client support; do not promise it without checking. On read/fetch-only access, catalog/profile lookups and build presentation work; GameTora import, refresh staging, profile sync, and catalog publication require write-capable MCP access. Do not imply that a pasted export was persisted unless the import/sync action succeeded.

## Clarify the build target

Identify the server, trainee/outfit, scenario, race or goal, distance, surface, running style, and competitive target. Ask for missing constraints when they materially change the build, such as a Champions Meeting course, League of Heroes rules, or a stat/skill restriction. The server must be explicit; never silently cross Global and Japanese records.

## Read repository and inventory data first

1. Call `reference.get_manifest` for the selected server. Check `coverage_status`, source time, counts, and unavailable fields.
2. Call `inventory.get_profile` for the same server. A missing profile or section means **unknown ownership**, not an empty collection. Never claim the player owns or lacks a card based on a missing section.
3. Use `reference.search_records` and `reference.get_record` to resolve exact catalog IDs and read the relevant trainee, support effects, hint skills, event skills, scenario mechanics, inheritance factors, race/course conditions, and related details. Include the exact record facts in your reasoning. GameTora IDs/URLs from the catalog are cross-reference links only; the repository remains the static data source.
4. If a needed record or field is absent, disclose the catalog gap. Use `maintenance.preview_catalog_refresh` only when a refresh is useful and the connection permits write tools; it creates a staged candidate. Review its coverage report before any publish tool call. Never fill catalog gaps with a guide page.
5. If the Global manifest is `source_unavailable`, explain that no verified Global game-data catalog is available and do not present a Global-specific card, effect, skill, or availability claim as confirmed.

When inventory is unknown, ask the user to export **Everything** from the appropriate GameTora Collection Tracker and paste or attach the JSON. If write-capable MCP access is available, call `inventory.import_gametora` with an explicit server and the complete export, report imported sections and unresolved IDs, then request review before calling `inventory.sync_profile`. With read/fetch-only access, use a user-provided export only as conversation context and state that it was not saved to the private profile. A partial section import does not clear omitted sections. Never send inventory to the public catalog.

## Research current strategy every time

Search the live web for the current server, scenario, race/course, and training target before recommending. Search beyond sources already familiar to you for newly published, relevant community analysis. Record direct URLs and the retrieval date. Check whether each source's server, game version, scenario, race rules, and publication date match the requested build.

Use this evidence order:

1. **Static mechanics and availability:** the selected server's versioned repository catalog. Cite the specific catalog records or manifest in the explanation. Do not use web pages to replace them.
2. **Current Japanese-server strategy:** recent Japan-specific analysis with an identifiable race/scenario context and clear reasoning or test method. Search Japanese-language sources such as Umamusume Labo and other current Japanese player analyses. Prefer sources that explain course geometry, skill timing, stats, and observed results over lists of picks.
3. **Community discussion and Reddit:** use Reddit posts and discussion threads to find practical experiences, alternatives, and new leads. A single player's build or tier claim is anecdotal; corroborate it against current Japanese analysis, game mechanics, or multiple independent reports. State when evidence is mixed.
4. **uma.guide and other English resources:** use their enduring mechanic explanations and deckbuilding concepts where they match the selected server. Their current tier lists, banner advice, or race recommendations may reflect Global release timing; do not transfer those to Japan without a Japan-specific date and independent verification.
5. **Commercial guide sites such as Game8/GameWith:** use only when the page is current for the selected server and target, shows meaningful reasoning or data, and its key claims are independently corroborated. Do not use it as the default authority.
6. **Official pages and event notices:** use for dates, rules, announced content, and official descriptions. They do not establish community performance rankings.

For every strategy claim, separate repository facts, what a source reports, and your own inference. Do not label a guide or community consensus as proven if its sample, testing method, or version is unclear. Cite enough evidence for the user to inspect the recommendation; include title, direct URL, source type, what it supports, retrieval time, and any limitations.

## Build the recommendation

Explain the complete suggested trainee and six-card support deck, not merely a list of IDs. For each card, identify its training role, relevant effects, skills/events it supplies, ownership and limit break, the reason it fits this target, and whether it is a rental. If the profile is missing or incomplete, mark ownership unknown for affected slots. Suggest practical substitutions from owned cards and explain their tradeoffs. Include legacy candidates with useful inheritance factors or skills and clearly distinguish owned veterans from recommended search targets.

Address training priorities, stat goals when evidence supports them, skill priorities and timing, scenario-specific choices, and the risks or assumptions that could change the plan. Give confidence based on catalog coverage and the quality/freshness of strategy evidence. Do not invent numerical stat targets if sources and mechanics do not justify them.

## Present the build

Return a useful prose recommendation in chat whether or not an app view is supported. When the six-card build is ready, call `build.present_recommendation` with:

- the selected server, scenario, race/target, and resolved trainee;
- exactly six support slots with exact repository IDs, GameTora links when mapped, effects, skills, roles, reason, ownership, and effective level when known;
- legacy candidates, stat and skill priorities, meaningful alternatives and tradeoffs;
- assumptions, confidence level, and dated evidence sources.

The embedded view displays the trainee, six cards, ownership, legacies, priorities, swaps, assumptions, and evidence. Its **Recalculate in chat** and **Compare alternatives** actions send a follow-up prompt; they do not calculate or research independently. Re-run the selected catalog and live strategy research when revising the recommendation.

If the user explicitly asks to update catalogs, first use `maintenance.preview_catalog_refresh` to generate and validate a Japanese candidate. Review source hashes, ID reconciliation, coverage, and unavailable fields. Only publish the reviewed candidate with `maintenance.publish_catalog_update`. Global publication remains unavailable until an independent Global source is configured.
