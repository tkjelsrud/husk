# Music "Glue" — Listen-at-Work Idea Desk (Husk + lofi audio proxies)

> Status: **planning only**. No development yet — Husk is in daily use and must stay stable.
> This doc is the agreed design we keep refining until it's right.

## Context

Music-making is sporadic ("an hour here and there", often *not* at the studio Mac).
Capture is already solved (a liked "Creative Harness" for new songs; studio moving to the
basement around a **Zoom R20** multitrack recorder). The real pain is the gap **between** a
recorded idea and a finished track: no way to, in spare moments (especially **at work**),
*pull up an idea I recorded, listen to it, and note how to progress it*. So good ideas are
forgotten and new ones get started instead of strong existing ones being carried forward.

### Role split (each tool does what it already does best)

- **Home Ubuntu server (24/7)** = the input + processing plane. A **network share** on it is
  where sketch bounces land; its existing backend processor turns them into review proxies.
- **Husk** (`../husk`, the user's own Firebase web app, used daily, reachable at work) =
  the glue / idea desk: capture, triage, per-track notes, the review loop.
- **Firebase Storage** = where small lofi proxies live so they're streamable at work.
- **jottacloud** = optional later addon for archiving masters/stems off the share. **Not**
  on the critical path.
- **badstudio-portfolio repo** = project execution + publishing (`notoms3/`,
  `_data/releases.json`, project pages). Unchanged.

### Why Husk, and why this is mostly already built

Husk already has the exact shapes needed: an `entries` queue with a **`creative`
category** plus `later`/`done`/`priority`/drag-order (the listen-and-decide loop), and a
`documents` collection of markdown docs (the per-track running log, the `tr_*` equivalent).
Its **MCP server** exposes `add_work_item`/`list_work_items`/`edit_work_item`/
`mark_done_work_item` and full `documents` CRUD, so opencode/Claude can read and advance
the desk too. The backend **processor** runs 24/7 on the Ubuntu server (systemd, ~10-min
cadence) with a Firebase service-account client and `create_entry`/`create_document`
helpers, plus an idempotent "only-work-when-changed" pattern (`fixed_exporter.py`) to copy.

### The one missing piece: listenable audio at work

The sketch WAVs sit on the home network — not reachable at work. Uploading full masters to
Firebase is wasteful, but a **mono lofi proxy** (3 min ≈ ~1.5 MB) is tiny, and Firebase
Storage gives **stable, range-streamable URLs** under the same auth as Husk. So: masters
stay on the home share; only small proxies go to Firebase, purely so an idea can be played
from its Husk entry while at work.

## Design

### Flow
```
basement: hardware (Octatrack, guitar, synth, looper) → Zoom R20 multitrack
        →  record take, quick stereo mixdown → one stereo WAV = the "sketch"
at home:  copy SD card / USB → a NETWORK SHARE on the Ubuntu server
          (e.g. //homeserver/sketches-inbox  →  /srv/sketches-inbox)
home server (existing systemd cadence) processes the share LOCALLY — no jotta, no download:
        • see each NEW/changed file (manifest by hash/mtime/size)
        • ffmpeg → mono lofi mp3 (~64 kbps)
        • upload proxy to Firebase Storage, mint a stable download-token URL
        • create_entry(category='creative') with title + play URL + source pointer
at work later  →  open Husk → play the proxy → write the "next step"
```

> Because the input is a **local folder on the 24/7 server**, processing is naturally
> automatic (scheduled poll, or an inotify watch) — no carrying cards to work, no remote
> trigger. A manual `--once` mode stays for testing/catch-up.

### Capture workflow: "record a sketch from the hardware sampler"

The front-end that feeds the share. Principle: capture is for **volume + intent**, not
quality — one take, one line of intent, judge later. The failure mode to design against is
"a file with no memory of what it was or what to do next."

Per sketch (in the moment, ~2 min):
1. Get a loop/pattern going on the Octatrack (+ guitar/synth) that feels like *something*.
2. On the R20: arm the relevant tracks, record **one continuous take**, 1–4 min; don't
   stop for mistakes.
3. **Quick stereo mixdown / master bounce** on the R20 → one stereo WAV (the review file).
   The multitrack stems stay on the SD as the master for later finishing.
4. **Capture intent immediately** (the key step): speak ~5 s at the tail of the take
   ("OT, ~82 bpm, dubby, try guitar over B"), *or* fire a one-line Husk `creative` entry
   from the phone. This is what makes the sketch resumable later.
5. Don't curate — keep it, move on.

Offload (at home, periodic): copy the SD/USB stereo bounce into the network share; rename
roughly `YYYY-MM-DD_device_bpm_mood_n.wav`. The server auto-processes; review in Husk.

> The above is **capture path A (studio / R20)** — good-quality sketches via the share.

### Capture path B: quick phone capture (Husk in-browser mic recorder)

For "I have an idea right now" moments anywhere (also doubles as the intent-capture step).
Record straight in Husk on the phone and store to Firebase — no studio, no share, no cable.

How it works:
- A new **isolated** page `record.html` + `js/record.js` (reuses `auth.js`; does **not**
  touch `write`/`entries`/`dashboard`, so it can't destabilize the running app).
- `getUserMedia({audio})` → `MediaRecorder` → on stop, a Blob → upload to Firebase Storage
  (`sketches/phone/<uid>/<timestamp>.<ext>`) via the web SDK → `getDownloadURL()` →
  `create a 'creative' entry` with the URL (same template as path A, `src: phone`).
- Tiny + mono-ish already, so **no proxy step** — fully client-side, instant.

Constraints / notes:
- iOS Safari 14.3+ and Android/desktop Chrome support `MediaRecorder`; HTTPS required
  (GitHub Pages ✓). Formats differ (Safari = mp4/AAC, Chrome = webm/Opus).
- This path needs **client-facing Storage rules** (auth'd allowlisted read/write), unlike
  path A which uses the server admin SDK + token URLs. Enabling Storage covers both.
- Format fork: Phase-1 store-and-play-as-is (review on one main browser) vs. later let the
  server processor normalize phone uploads to lofi mp3 for cross-browser playback.

### Husk record shape (no app/schema change — uses existing `creative` entries)
`textInput` template:
```
🎧 <title from filename>
play: <firebase proxy URL>
src: share:/sketches-inbox/<file>
next:
```
Triage with the existing queue (`later`/`done`/`priority`). The `next:` line is the field
edited at work. When an idea deepens, **promote** it to a Husk `documents` track-log and
link it.

### Pointer / data-location convention
- Canonical input: the network-share folder (default `/srv/sketches-inbox`).
- Pointer format in any Husk record: `share:/sketches-inbox/<file>` for files, or device
  refs like `octatrack: bank 4 / pat A2`, `r20: project 07` when there's no file yet.

### Templates (Husk `documents`, paste-in — no code)
- **Idea Desk** index doc: table of ideas with state + pointer + links (the glance).
- **Track: <name>** log doc: generalised from `notoms3/tr_template.md`.

### Security note
Phase-1 uses unguessable Firebase **download-token URLs** (no expiry, link-is-the-key) so
no frontend change is needed and Storage rules stay deny-all for clients. Acceptable for
private sketches; can later tighten to auth'd Storage reads in the Husk frontend.

## Files to create / modify (in `../husk`, when development is approved)

- `backend/processor/audio_proxy.py` **(new)** — core: scan the local share folder, manifest
  check, ffmpeg transcode, `firebase_admin.storage` upload + token URL, `create_entry(...)`.
  Reuses `firestore_client.create_client` / `create_entry`. Reads the folder directly — no
  rclone/jotta dependency.
- Wired into the existing processor run so the server timer processes the share
  automatically; also runnable as `python -m backend.processor.audio_proxy --once`.
- `backend/processor/config.py` — add `Settings` fields: `storage_bucket`, `sketches_dir`
  (local path), `proxy_bitrate` (default `64k`), `audio_manifest_path`, `audio_added_by_email`.
- `backend/.env.example` — document the new vars.
- `backend/requirements.txt` — confirm `firebase-admin` covers `firebase_admin.storage`
  (it does); add nothing Python-side. `ffmpeg` is the only new system binary.
- `storage.rules` **(new)** + `firebase.json` — enable Cloud Storage. Rules allow auth'd
  allowlisted read/write under `sketches/phone/<uid>/…` (for path B's client uploads);
  server path A writes via the admin SDK (bypasses rules) and serves via token URLs.
- `record.html` + `js/record.js` **(new, path B)** — isolated mic-recorder page:
  `getUserMedia`/`MediaRecorder` → Storage upload → `create 'creative' entry`. Reuses
  `auth.js`; touches none of the existing pages.
- `README.md` — document the audio-proxy job + one-time setup.
- Husk `documents`: create **Idea Desk** index + a **Track:** template (paste-in content).

## One-time setup (on the Ubuntu server / Firebase)

1. Create the input share: a folder (e.g. `/srv/sketches-inbox`) exported via **Samba**
   (or NFS) so the Mac / basement machine can drop files onto it over the home network.
2. `apt install ffmpeg` on the server.
3. Firebase console: enable Cloud Storage; note the bucket; service account already exists
   (`FIREBASE_SERVICE_ACCOUNT_PATH`). Deploy `storage.rules`.
4. Fill the new `backend/.env` vars (`sketches_dir`, `storage_bucket`, …).

*Optional later addon:* `rclone` job to mirror the share's masters/stems up to jottacloud
for archive/backup — kept off the critical path.

## Verification

1. Drop 1–2 test WAVs into the share (`/srv/sketches-inbox`).
2. On the server: `python -m backend.processor.audio_proxy --once`.
3. Confirm: a proxy lands in Firebase Storage; a `creative` entry appears in Husk with a
   `play:` URL; the URL **plays in a browser from a work-like context**; the `src:` pointer
   is correct.
4. Re-run → no duplicate entries (manifest works); change one source file → only that
   proxy/entry updates.
5. Promote one entry to a **Track:** document and confirm it renders on Husk `/write`.

## Open points to resolve before building
- Zoom R20 SD folder/file structure, and whether a "quick stereo bounce" is genuinely fast
  on that unit (test before committing the capture workflow).
- Share protocol (Samba vs NFS) and how the basement/Mac actually mounts it.
- Download-token URL security trade-off vs. auth'd Storage reads in the Husk frontend.
- Whether per-track logs are Husk `documents` from the start or only on promotion.
