# Japanese reference catalog source map

This document maps the installed Japanese game data into catalog entities. The exporter reads only the installed master database, installed Hachimi localization bundle, and already-extracted Hachimi story assets. It must not inspect account saves or modify the game installation.

## Source files and boundaries

| Source | Data used | Boundary |
| --- | --- | --- |
| `UmamusumePrettyDerby_Jpn_Data/Persistent/master/master.mdb` | Game master records and Japanese `text_data` | Open SQLite read-only. The master file hash, not an assumed patch number, identifies the source snapshot until an explicit build/version field is established. |
| `hachimi/localized_data_1/text_data_dict.json` | Optional English text by category and index | Use only when a matching entry is non-empty. Keep the Japanese master string and translation provenance alongside it. Missing keys are untranslated, not missing game facts. |
| `hachimi/localized_data_1/assets/story/data/**/storytimeline_*.json` | Extracted story dialogue/choice text when present | Read-only, optional per story. This install's extracted subset does not include every story referenced by master data; absence must be reported per story, not filled with guessed rewards. |
| Live external references | Cross-check GameTora routing/labels and curated event details if needed | Never replace the repository's static facts at advice time. External facts must be imported by a reviewed catalog refresh and carry source URL, server scope, access date, and field-level provenance. |

Current observed source counts are in [reference coverage](reference-coverage.md). Counts describe the installed snapshot inspected on 2026-10-18 and should be regenerated for later game updates.

## Support cards

| Catalog field | Source table/key | Relationship / interpretation |
| --- | --- | --- |
| Stable game ID, rarity, character ID, support category, command, effect-table ID, unique-effect ID, release timestamp, hint group ID | `support_card_data.id` | One record per source row. Preserve all raw IDs and codes. |
| GameTora support ID | `support_card_data.id` | GameTora detail routes use this numeric ID (`.../supports/10001-special-week`, `.../supports/10021-tazuna-hayakawa`). Keep the numeric ID independent of the display-name slug. The route samples and GameTora list count are cross-checks, not a proof that an omitted local row is available in both servers. |
| English URL slug | Hachimi translation for character name, category `77` | Make a normalized slug from the translated character name (for example, `Special Week` → `special-week`), not from the full support card display name. The site accepts the numeric ID with its character slug. Store an ID-only fallback link if no verified slug is available. |
| Japanese display label / card name / episode text | `text_data` categories `75`, `76`, `88`; key is support card ID | Category 75 is the display label; 76 is the short card-name/title shown by the Umamusume Wiki data module; 88 is the card episode text. Preserve raw Japanese. Categories 77/78 are auxiliary character-name texts and should not replace category 75/76. |
| English display label / card name / episode text | Hachimi category/index keys `75`, `76`, `88` | Translation is present only for a subset. Keep Japanese and mark English unavailable per field if absent. |
| Support type | `support_card_data.command_id`, `support_card_type` | Preserve raw codes. Confirmed type labels from the Umamusume Wiki support data module: command 101 Speed, 102 Power, 103 Guts, 105 Stamina, 106 Wit; support type 2 Pal and 3 Group. Do not use the draft exporter's old 102/105 mapping, which reverses Power and Stamina. |
| Levelled support effects | `support_card_data.effect_table_id` → `support_card_effect_table.id`; rows by `type` | Preserve each raw type and every level column (`init`, `limit_lv5`…`limit_lv50`) and omit sentinel `-1` values. Translate type labels/descriptions with `text_data` categories `151`/`154` (keyed by effect type) and Hachimi entries of the same key. Include effect type/unit interpretation only when its mapping is independently reviewed. |
| Unique effect | `support_card_data.unique_effect_id` → `support_card_unique_effect.id` | The table has one or more level rows per effect ID. Preserve each row's `lv`, `type_0/1`, every `value_*`, and `idle_mode_sub_rate`; localize name/description with categories `150`/`155` keyed by unique effect ID. Do not flatten opaque components into prose without a verified decoder. |
| Group support characters | `support_card_group.support_card_id` → `support_card_data.id`; `chara_id` → character ID | Preserve all members and `outing_max`; this table has group-card relationships. |
| Hints / hint skills | `single_mode_hint_gain.support_card_id` → support ID | Filter `hint_gain_type = 0`; `hint_value_1` is the skill ID and `hint_value_2` is retained as the raw hint value/level. Resolve the skill ID against `skill_data.id`; keep unresolved IDs. Preserve hint group, condition set, group, and priority. `hint_gain_type = 1` rows encode raw stat/reward values; keep those in a separate raw reward list and do not call them skill hints. `support_card_data.skill_set_id` is a hint-group key (`hint_id`), not a `skill_set.id` foreign key. |
| Support event chain/title | `single_mode_story_data` filtered by `support_card_id > 0`; use `gallery_flag = 2` for the support training-event list; record `id`, `story_id`, `short_story_id`, `show_progress_*`, `event_category`, support character/card IDs | `single_mode_story_data.id` is the event ID and `story_id` is its story/title ID. `text_data` category `181`, indexed by `story_id`, supplies Japanese title; Hachimi category 181 can supply English. Preserve chain fields and source row IDs. Some events attach to a character rather than a card through `support_chara_id`; keep those separate. |
| Support event choice/result data | Extracted story timeline JSON for matching `story_id`, if present | The inspected `master.mdb` has no support event outcome table that joins a choice to a support card/story. `single_mode_story_root` and `single_mode_story_condition_set` express branch conditions/order; `single_mode_event_choice_reward` contains only display/effect-type codes and no card/story key. The sampled support story `809001033` has a title row but no matching extracted `storytimeline_809001033.json`. Exact option rewards require another reviewed source and must remain unavailable until imported. |
| Card text timeline | `single_mode_story_data.story_id` → extracted `storytimeline_{story_id}.json` where present | Parse text/choice blocks as story source; do not treat story text alone as a structured reward. Store the source file hash and story ID. |

### Support card ID mapping evidence

The installed database has 563 `support_card_data` rows. GameTora's Japanese support list reports 563 cards in the current crawl. Two stable samples confirm the numeric route mapping: game support IDs 10001 and 10021 resolve to the matching GameTora cards. The GameTora detail slug uses the character name, not the support title: `10001-special-week` and `10021-tazuna-hayakawa`. Per-record route status should be `verified_sampled` until a full ID-set reconciliation is implemented; an equal count alone does not prove a complete 563-ID match.

## Trainee outfits and characters

| Catalog field | Source table/key | Relationship / interpretation |
| --- | --- | --- |
| Outfit ID and character ID | `card_data.id`, `card_data.chara_id` | Export one record per outfit (`default_rarity > 0` for player outfits). Keep outfit ID distinct from character ID. |
| Rarity, limited flag, default growth, running-style code, available-skill-set ID | `card_data` | Preserve raw running-style code; do not infer a name without an explicit code table. |
| Base stats, aptitude codes, caps, costume IDs, rarity-specific skill-set ID | `card_rarity_data.card_id` → outfit ID, with one row per `rarity` | Export every rarity row, not only default rarity. Preserve aptitude numeric codes and raw rarity-specific skill-set link. |
| Character names | `text_data` categories `6` and `182` keyed by `chara_id`; Hachimi matching key | Retain Japanese and optional English plus per-field localization status. |
| Outfit name/title | `text_data` categories `4` and `5` keyed by outfit `card_data.id`; Hachimi matching key | Category 4 is the outfit label and 5 its title. Do not key these strings by character ID. |
| Available/unlockable skills and rank requirement | `card_data.available_skill_set_id` → `available_skill_set.available_skill_set_id`; records expose `skill_id`, `need_rank` | Resolve against `skill_data.id`; preserve rank and source relationship. |
| Initial and rarity skill sets | `card_rarity_data.skill_set` → `skill_set.id`; slots `skill_id1..20` and paired `skill_level1..20` | Preserve every nonzero slot in slot order. Resolve each skill ID, retaining unresolved links. |
| Talent upgrade hint items | `card_talent_hint_upgrade.card_id` → outfit ID | Preserve rarity, talent level, and item category/ID/count slots. This is talent upgrade material data, not a trainee event reward. |
| Trainee events/career unlocks | `single_mode_story_data.card_id`/`card_chara_id` and story assets; `skill_upgrade_succession_skill`, `skill_upgrade_speciality` for skill replacement mappings | Store raw event/story links and explicit replacement relations. Structured career choices/rewards are unavailable unless a matching story asset or reviewed external source supplies them. |
| GameTora trainee ID/route | Local outfit ID and `chara_id`, checked against GameTora trainee detail/list records | Keep GameTora's numeric card identifier and character identifier as separate fields. Do not derive a trainee route from a support route. Full mapping is a refresh-time reconciliation task. |

## Skills and effects

| Catalog field | Source table/key | Relationship / interpretation |
| --- | --- | --- |
| Skill identity, rarity/category/group/grade, order, start/end dates | `skill_data.id` | Keep exact ID and raw enums. |
| Japanese name/description | `text_data` categories `47`/`48`, key `skill_data.id` | Master table has 2,200 rows in each category in this install. |
| English name/description | Hachimi categories `47`/`48`, same key | Translation coverage is partial; preserve Japanese when unavailable. |
| Skill condition/effect | `skill_data` raw columns | Preserve both `precondition_1`/`condition_1` and `precondition_2`/`condition_2`, timing/cooldown, and each of the up to three ability entries per condition. Keep raw ability/type/value/target codes. Normalize text only with a reviewed code dictionary; retain raw values next to any label. |
| Skill acquisition relationships | `single_mode_hint_gain`, `available_skill_set`, `skill_set`, `single_mode_14_finals_gain_skill`, scenario/skill-upgrade tables | Build reverse indexes by skill ID showing the exact support, trainee, scenario, or skill-set source. Unresolved relationships remain visible. |

## Scenarios, races, and inheritance

| Entity | Source tables and joins | Export guidance |
| --- | --- | --- |
| Training scenarios | `single_mode_scenario.id`; `single_mode_scenario_group.scenario_id` → scenario ID; companion scenario tables named `single_mode_*` and keyed by `scenario_id`/`scenario_group_id` | Export raw scenario bounds, skill-cost values, support count, start/end timestamps, and scenario-group mapping. Add scenario mechanics only when their table meanings are decoded and source-backed. Do not treat every historical scenario row as current. |
| Race course | `race.course_set` → `race_course_set.id`; `race_course_set.race_track_id` → `race_track.id`; `race_instance.race_id` → `race.id`; `race_condition.id` for conditions | Preserve ground, distance, direction/turn, track IDs, weather/season/ground-condition codes and race timing. Include schedule/route records only with their scenario and server context. |
| Inheritance factors | `succession_factor.factor_id`; `succession_factor.factor_group_id` → `succession_factor_effect.factor_group_id`; `effect_group_id` remains a separate raw group relation | Preserve rarity, grade, factor type, dates, hidden flag, effect ID/target/value fields, and addon/initial-factor relations. Never infer human-readable factor value labels without a verified mapping table. |

## Localization policy

Store `ja` text from `text_data` as the primary source. If Hachimi provides a non-empty string for the same category and index, store it as an English translation with provenance `{source: "hachimi", bundle: "localized_data_1", category, index}`. Otherwise set English to null and localization status to `unavailable`. A localized string is not a server-availability signal. The Hachimi translation file in this install is incomplete (coverage counts are listed in the coverage report).

## External validation references

- [Umamusume Wiki support data module](https://umamusu.wiki/Module:Game/Supports/Data): documents support IDs, text categories, rarity and support type mappings, group characters, and its `single_mode_hint_gain` skill link.
- [Umamusume Wiki support event module](https://umamusu.wiki/Module:Game/Supports/Data/Events): documents the support/character event query and `gallery_flag = 2` filter.
- [Umamusume Wiki training event module](https://umamusu.wiki/Module:Game/TrainingEvents/Data): documents `single_mode_story_data.id`/`story_id`, category 181 event titles, and chain progress fields.
- [GameTora Japanese support list](https://gametora.com/ja/umamusume/supports): current list count used as a refresh-time cross-check.
- [GameTora Special Week R detail](https://gametora.com/umamusume/supports/10001-special-week) and [Tazuna Hayakawa R detail](https://gametora.com/umamusume/supports/10021-tazuna-hayakawa): sampled numeric support ID routes and character-name slug format.

Community modules are validation references, not a substitute for regenerating from the installed database. Capture the access date and reviewed upstream revision in the generated manifest when these mappings are used.
