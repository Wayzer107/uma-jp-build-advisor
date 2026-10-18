# Reference catalog coverage

This is an observed source-coverage snapshot for the installed Japanese build on 2026-10-18. It is not a claim that every narrative outcome or every Global field is complete. The production validator will regenerate this report from the exact source hashes and catalog records.

## Snapshot summary

| Server | Source state | Catalog state | Notes |
| --- | --- | --- | --- |
| Japan (`ja`) | Local `master.mdb` and Hachimi localization bundle available | `incomplete` | Core master tables are present, but the current catalog draft exports only a subset of them; event choice outcomes and some story assets need separate sourcing. |
| Global | No independent Global install/export has been identified in this workspace | `source_unavailable` | Do not copy JP rows into `data/global/` or claim Global support-card, trainee, skill, release, or scenario coverage from JP facts. |

## Japanese source counts

Counts below are source-table row counts, not counts of addressable generated catalog records. They must be recalculated after each local game update.

| Source table/file | Observed rows or keys | Intended output | Coverage note |
| --- | ---: | --- | --- |
| `support_card_data` | 563 | Support cards | GameTora Japanese support list reports 563 at the snapshot check. Sample routes for IDs 10001 and 10021 resolve. A full numeric ID-set reconciliation is still required. |
| `support_card_effect_table` | 5,163 | Per-level support effects | Joined by `support_card_data.effect_table_id`; current draft does not preserve every effect row/level. |
| `support_card_unique_effect` | 417 rows | Unique effects | Join by unique effect ID; rows contain component type/value slots. Current draft is partial. |
| `single_mode_hint_gain` | 5,200 | Card hints/stat rewards | 535 distinct support IDs occur in this table. Current catalog draft does not contain linked hint records. Zero hint rows for a card must be distinguished from an unresolved relation. |
| `single_mode_story_data` | 20,573 | Support/trainee event identities | 420 distinct support-card IDs have story rows; 1,195 support-card rows use `gallery_flag = 2`. Titles and chains can be extracted, but reward choices are not represented by these fields. |
| `single_mode_story_root`, `single_mode_story_condition_set` | 36 / 487 | Story branch conditions | Preserve raw story links; these tables do not by themselves provide card choice rewards. |
| `single_mode_event_choice_reward` | 59 | Choice display/effect code definitions | No card or story join key; insufficient to populate per-event rewards. |
| `card_data` (`default_rarity > 0`) | 271 outfit rows | Trainee outfit records | Current draft exports basic growth only; rarity rows, skills, aptitudes, and caps are absent. |
| `card_rarity_data` | 844 | Outfit stats, aptitudes, skill sets | Export all rarity records, not only the default outfit row. |
| `available_skill_set` | 1,909 | Trainee skill unlocks | Join by `card_data.available_skill_set_id`; current draft omits them. |
| `skill_set` | 6,153 | Slot-based skill bundles | Resolve the up-to-20 skill/level slot pairs for rarity skill sets and other source tables. |
| `skill_data` | 2,200 | Skills and raw activation/effect conditions | Japanese name/description text exists for all source IDs; localized English is partial. Current draft omits skill records. |
| `single_mode_scenario` / `single_mode_scenario_group` | 14 / 84 | Scenarios and scenario group mappings | Preserve raw parameters; historical entries require current-scenario filtering/labels. |
| `race` / `race_instance` / `race_course_set` / `race_condition` | 2,923 / 3,411 / 140 / 119 | Race/course/conditions | IDs and numeric conditions are present; many code meanings need verified labels. |
| `succession_factor` / `succession_factor_effect` | 2,622 / 6,826 | Inheritance factors/effects | Raw factor and grouped effect values are present; some effect decoding is not independently verified. |

## Hachimi English text coverage

Master row count and translated entry count are compared by category. This is raw key coverage, not a quality rating. Untranslated English fields must retain Japanese text and an explicit null/unavailable translation status.

| Category | Use | Master rows | Hachimi entries |
| ---: | --- | ---: | ---: |
| 4 / 5 / 6 | Trainee outfit label/title and character name | 273 / 273 / 173 | 258 / 181 / 172 |
| 47 / 48 | Skill name/description | 2,200 / 2,200 | 1,860 / 1,858 |
| 75 / 76 / 88 | Support display name/card title/episode | 563 / 563 / 563 | 508 / 492 / 125 |
| 150 / 155 | Unique support effect name/description | 417 / 417 | 350 / 386 |
| 151 / 154 | Leveled support effect name/description | 32 / 32 | 32 / 32 |
| 181 | Story/event title | 19,784 | 4,973 |
| 182 | Character name | 173 | 172 |

## Explicitly unresolved data

- Support event choices and rewards: the inspected master tables expose event IDs, story IDs, title text, chain progress, and branch conditions, but not a per-event reward payload keyed to the card/story. The installed `single_mode_event_choice_reward` table only exposes effect/display type codes. A matching extracted story file may help recover choice text but does not guarantee structured rewards. Import an independently reviewable JP source with per-record citations or keep the reward fields unavailable.
- Story assets: the Hachimi extraction contains story timeline JSON files, but at least one locally referenced support story (`809001033`) has no matching extracted timeline file. The production coverage report must enumerate story IDs with missing assets.
- Translation: Hachimi English text is partial in several categories. Japanese source fields remain canonical.
- Support mapping: two detail routes are sampled; total list counts match. The numeric ID set still needs a machine reconciliation before `gametora_mapping_status` can be `verified` for every card.
- GameTora trainee mapping: outfit IDs and character IDs must be checked separately against the live trainee list/detail route before generated mapping is marked exact.
- Global catalog: source remains unavailable. Build a separately sourced Global catalog only after an independent Global source and its server scope are demonstrated.
- Interpreted skill, support-effect, aptitude, factor, and race code labels: preserve raw codes until each decoder is verified against current game or authoritative community data.

## Publication rule

The JP manifest must use `coverage_status: "incomplete"` until the required declared scope has no missing source records or silently dropped links. It may still publish an explicitly incomplete, versioned snapshot for read-only lookup. The Global manifest remains `source_unavailable` until a Global source adapter is independently verified. A generated `complete` status is reserved for a scope whose coverage validator can demonstrate all required source records, link resolution, GameTora mappings, and field-level localization availability/status.
