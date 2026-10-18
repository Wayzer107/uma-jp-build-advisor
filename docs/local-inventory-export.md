# Local inventory export options

## Supported path: GameTora Everything JSON

The GameTora Collection Tracker exposes a single **Everything** backup covering trainees (`charCards`), support cards (`supports`), and veterans (`veterans`). Its export/import UI describes the backup as portable collection data, and its changelog documents importing in-game JSON from third-party dumpers into the trainee, support, and veteran trackers. The versioned UI code currently emits GameTora JSON version 4. This is the only exporter route implemented and accepted as a complete inventory snapshot in this project.

Use one file for a selected server, pass `--server ja` or `--server global` explicitly, and inspect the import summary before private sync. The source file stays in the private repo beside a history snapshot. See [inventory profile](inventory-profile.md).

## Hachimi and other local exporters

Hachimi Edge's published documentation covers translation/runtime configuration, but no supported Hachimi plugin or documented export interface was found that emits all three ownership sections with support limit breaks, trainee outfits, and veterans. The installed Hachimi translation bundle used by the public catalog is not an ownership source. This project does not read game/account save databases, hook decrypted account responses, or claim an automatic Hachimi export.

GameTora's changelog says its tracker accepts JSON from third-party in-game dumpers, but that statement does not establish a particular dumper's coverage or stability. A future local adapter must be checked against a dated example from that dumper and confirm all required sections, fields, server/build identity, and unknown-field preservation before it can replace or auto-sync a profile.

Trackside documents a veteran export path after opening the in-game Veteran List, but it is a separate community tool and its veteran export alone does not satisfy the support/trainee/veteran Everything contract. Treat it as a possible veteran supplement only after a version-specific adapter is reviewed; it is not enabled as automatic sync here.

## Refresh workflow

1. Export GameTora's Everything backup for the intended server.
2. Import it to a local candidate profile with `scripts/import_gametora.py`.
3. Review detected server key, section counts, partial sections, warnings, and unresolved IDs.
4. Sync the reviewed candidate to the matching private `profiles/{server}/` path.
5. Keep automatic sync disabled unless the user config explicitly enables it; it must remain private-only and pausable.

No inventory export has been supplied for the current profile, so both server inventories remain unknown until a GameTora file is imported.

## Sources checked

- [GameTora Collection Tracker](https://gametora.com/umamusume/collection-tracker/supports) (Backup UI shows Trainees, Supports, Veterans, and Everything export sections).
- [GameTora 5th Anniversary changelog](https://gametora.com/umamusume/gametora-5th-anni) (documents importing third-party in-game JSON into trainee/support trackers and the Veterans tracker).
- [Hachimi Edge FAQs](https://hachimi.noccu.art/docs/hachimi/faqs) and [configuration docs](https://hachimi.noccu.art/docs/hachimi/config) (document translation/runtime configuration, not an inventory exporter).
- [Trackside](https://github.com/TheCing/Trackside) (documents a veteran export feature; not a complete Everything collection export).
