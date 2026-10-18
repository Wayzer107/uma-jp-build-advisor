# Reference catalog coverage

This report summarizes the Japanese catalog generated from the installed game data and the versioned GameTora support and character-card feeds on 2026-10-18. It is not a claim that every event choice reward is available. The current catalog is explicitly marked `incomplete` while per-event choice/reward records have no reviewed structured source.

## Snapshot summary

| Server | Source state | Catalog state | Notes |
| --- | --- | --- | --- |
| Japan (`ja`) | Local `master.mdb`, Hachimi English text bundle, extracted story assets, and GameTora support/character feeds available | `incomplete` | Every declared addressable record ID matched the installed master source. All 563 support IDs and 271 trainee outfit IDs matched GameTora's versioned feeds exactly. Event choice rewards remain unavailable from the inspected local source. |
| Global | No independent Global install/export identified in this workspace | `source_unavailable` | Do not copy JP rows into `data/global/` or claim Global support-card, trainee, skill, release, event, or scenario coverage from JP facts. |

## Japanese source-to-record coverage

The local generation and coverage validator compared each record ID with the source table scope. All entity ID sets matched with no missing, unexpected, or malformed IDs. These counts refer to the published `data/ja/` catalog; `coverage-report.json` is its machine-readable evidence file.

| Entity / source | Source rows in scope | Generated records | ID coverage | Notes |
| --- | ---: | ---: | --- | --- |
| `support_card_data` → support cards | 563 | 563 | Exact | Full ID set also matches GameTora support feed version `ecbd7dc3`; no missing, extra, or duplicate feed IDs. Canonical URLs use GameTora `url_name`. |
| `support_card_effect_table` | 5,163 | Included on support records | Joined | Every linked source effect row and non-sentinel level value is kept on its card. |
| `support_card_unique_effect` | 417 rows | Included on support records | Joined | Component type/value slots and level rows are preserved raw. |
| `single_mode_hint_gain` | 5,200 | Included on support records | Joined | 535 distinct support IDs occur in the local table. Skill hint IDs resolve against the generated skill set; other reward codes remain raw. |
| GameTora support feed | 563 | 563 cross-checks | Exact set match | Feed event-skill IDs are stored with GameTora provenance; feed hints are cross-checked against local `single_mode_hint_gain`. |
| GameTora character-card feed | 271 | 271 cross-checks | Exact set match | Feed `card_id` maps to local trainee outfit `card_data.id`; its `char_id` and canonical `url_name` remain separate fields. Current inspected feed hash: `d3ec4f6d`. |
| `single_mode_story_data` linked to trainee/card/character IDs | 18,365 | 18,365 | Exact | Support training-event rows with `gallery_flag = 2`: 1,195. Event IDs, story IDs, titles, chain fields, and raw branch relationships are present. |
| `card_data` (`default_rarity > 0`) → trainee outfits | 271 | 271 | Exact | Per-outfit names, growth, event IDs, and all rarity rows are present. |
| `card_rarity_data` | 844 | Included on trainee records | Joined | Base stats, caps, aptitudes, costumes, and rarity skill-set links are preserved. |
| `available_skill_set` | 1,909 | Included on trainee records | Joined | Skill IDs and rank requirements are present. |
| `skill_set` | 6,153 | Used by linked trainee rows | Joined | Nonzero skill/level slots are preserved in source order. |
| `skill_data` | 2,200 | 2,200 | Exact | Japanese names/descriptions, raw activation conditions, raw effects, and reverse acquisition links are present. |
| `single_mode_scenario` | 14 | 14 | Exact | Raw parameters, date range, groups, and scenario skill replacements are present. |
| `race` / `race_course_set` / `race_condition` | 2,923 / 140 / 119 | 2,923 / 140 / 119 | Exact | Course and instance relations are retained; unresolved code meaning stays raw. |
| `succession_factor` / `succession_factor_effect` | 2,622 / 6,826 | 2,622 factor records | Exact factor IDs | Factor effect group rows are attached to factors; effect values stay raw where code meaning is not verified. |

## Hachimi English text coverage

This is raw key coverage, not a translation quality rating. Japanese source text remains canonical. A missing English entry is explicitly marked unavailable at the field level.

| Category | Use | Master rows | Hachimi entries |
| ---: | --- | ---: | ---: |
| 4 / 5 / 6 | Trainee outfit label/title and character name | 273 / 273 / 173 | 258 / 181 / 172 |
| 47 / 48 | Skill name/description | 2,200 / 2,200 | 1,860 / 1,858 |
| 75 / 76 / 88 | Support display name/card title/episode | 563 / 563 / 563 | 508 / 492 / 125 |
| 150 / 155 | Unique support effect name/description | 417 / 417 | 350 / 386 |
| 151 / 154 | Leveled support effect name/description | 32 / 32 | 32 / 32 |
| 181 | Story/event title | 19,784 | 4,973 |
| 182 | Character name | 173 | 172 |

## Explicitly unavailable or incomplete data

- Event choices/rewards: the inspected master tables expose event IDs, story IDs, title text, chain progress, and branch conditions, but not a per-event choice/reward payload keyed to card/story. `single_mode_event_choice_reward` has no card/story join key. All 18,365 generated event records therefore have `choices: null` and `rewards: null` until a reviewed structured source is added.
- Extracted story assets: the install's extracted Hachimi subset does not include all story timelines referenced by the event rows. Each event record carries its own asset status; the manifest and coverage report include missing-story counts and a sample.
- Translation: several Hachimi categories have partial English coverage. These fields keep Japanese source text and an explicit unavailable translation state.
- Trainee GameTora mapping: the complete versioned character-card feed has a `card_id` for every outfit. All 271 `card_id` values exactly match installed `card_data.id` values. GameTora `tid` remains a separate trainer identifier used for veteran inventory mapping; it is not substituted for the outfit ID. Canonical outfit and character URLs remain separate.
- Interpreted skill, aptitude, race, and inheritance codes: raw game values are retained until each decoder is independently reviewed.
- Global catalog: source remains unavailable. A separately scoped Global source is required before records can be generated.

## Publication rule

JP remains `incomplete` while event choices/rewards have no reviewed structured source. This catalog can still be used for card effects, support hints and event-skill IDs, trainee stats/aptitudes/skills, race/course facts, scenario parameters, and inheritance-factor records. Global remains `source_unavailable`. Build advice must disclose those boundaries and use current community sources for strategy evidence without treating those sources as replacement server data.
