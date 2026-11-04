# Lofi Line-In Field Recorder — "Tape Brick" (Arduino Nano ESP32)

> Separate project from the music idea-desk plan (that one now lives at
> `../husk/docs/music-idea-desk-plan.md`). This device is an optional **capture path C**
> that feeds the same `sketches-inbox`, but stands on its own.

## Context

A DIY battery-powered lofi recorder: line-level audio in (from the Zoom R20 / Octatrack /
mixer), recorded mono to microSD with deliberately gritty character, then **auto-uploaded
over WiFi** to the home Ubuntu server's `sketches-inbox`. From there the already-planned
proxy pipeline turns it into a reviewable Husk entry — so the gadget closes the capture
loop with zero card-shuffling. It's a fun maker build first, a workflow add second.

Board on hand: **Arduino Nano ESP32** (u-blox NORA-W106 = ESP32-S3, dual-core 240 MHz,
16 MB flash, **8 MB PSRAM**, WiFi 2.4 GHz + BLE5, USB-C, **3.3 V logic**, A0–A7 analog).
The big PSRAM makes glitch-free recording easy; 3.3 V logic pairs directly with a microSD
breakout (no level shifting).

Decisions taken: **lofi via the built-in ADC** (not an I2S ADC), **real LiPo battery**,
and a relaxed enclosure — a cassette case / sleeve or similar small box, not a true
cassette shell.

## Design

### Signal chain
```
3.5mm line-in → coupling cap → attenuate + bias to mid-rail (~1.65V) → [RC anti-alias]
              → ESP32-S3 ADC1 pin (DMA continuous sampling, ~16–22 kHz, 12-bit, MONO)
              → PSRAM ring buffer → SdFat → WAV file on microSD
RECORD button: press = start, press = stop (toggle)   ·   WiFi OFF while recording
records fully OFFLINE to SD → recordings queue and persist across power cycles
back on home WiFi (auto-detected): connect → NTP → upload every un-uploaded WAV
              → home server → /srv/sketches-inbox → proxy pipeline → Husk 'creative' entry
LED: solid while recording · confirm-blink on save · upload/sync blink · error blink
```

### Offline-first capture & deferred sync (works anywhere, syncs at home)

The device is designed to be taken out and used with **no network**:
- Recording **never needs WiFi** — audio goes straight to SD; WiFi radio stays off during
  capture (saves power, cuts noise).
- Recordings **queue on the SD card** and persist across power-off — nothing is lost if the
  battery dies or it's switched off between recording and getting home.
- On returning to a **known home SSID** (polled periodically and/or on an "upload" press),
  the device auto-connects, gets NTP time, and **syncs every un-uploaded WAV**.
- **Safe sync semantics:** a file is only marked synced (moved to `/uploaded/` on the SD)
  **after** the server returns `200 OK`; failed/partial uploads are retried next time, so an
  interrupted sync simply resumes. Files are never deleted on the device until confirmed
  delivered (optionally keep a local archive and never auto-delete).
- If no known network is present, it just stays offline and keeps recording.

### Controls & indicators

- **One RECORD button** (debounced): press to **start**, press again to **stop** (toggle).
- **Status LED(s):**
  - **Solid ON** = recording in progress.
  - **Confirmation blink** on stop (e.g. 3 quick blinks) = "recording saved OK / done".
  - **Sync blink** (distinct colour/pattern, e.g. slow blue pulse) while uploading; a short
    triple-blink when sync completes.
  - **Error blink** (e.g. fast red) on SD-write or upload failure.
- A second small button (optional) to **force a sync attempt** now, instead of waiting for
  the periodic check. (Could also be a long-press of the record button to save a part.)

### Why these choices
- **Built-in ADC, mono, ~16 kHz/12-bit:** fewer parts, gritty on-aesthetic character.
  Must use an **ADC1** pin (ADC2 conflicts with WiFi) and the **continuous/DMA** ADC driver
  (`analogContinuous()` in Arduino-ESP32 core 3.x) — `analogRead()` in a loop is too
  jittery for audio. WiFi is off during capture anyway, which also cuts noise + saves power.
- **PSRAM ring buffer:** absorbs microSD write stalls (the classic dropout cause) — trivial
  with 8 MB. One core fills the ring from ADC DMA, a task drains it to SD via `SdFat`
  (preallocated contiguous file; WAV header finalized on stop).
- **Upload to the home server, not Firebase directly:** keeps the device dumb (no cloud
  creds/token juggling on an MCU) and reuses the planned pipeline. The cassette just fills
  the inbox like any other sketch.
- **No RTC:** get time via NTP at upload, or let the server stamp arrival time into the
  filename — no battery-backed clock needed.

### Components to build

- **Firmware** (new project `~/Dev/cassette-recorder/firmware/`, Arduino-ESP32 core 3.x):
  - ADC continuous capture task → PSRAM ring buffer.
  - WAV writer task (`SdFat`, contiguous preallocation).
  - State machine: idle / recording / syncing; debounced RECORD toggle; LED patterns
    (solid=recording, confirm-blink=saved, sync-blink, error-blink).
  - Offline queue + safe sync: WiFi uploader connects to a known SSID (periodic check /
    sync button), NTP, `HTTPClient` POSTs each un-uploaded WAV with a `Bearer` token, and
    moves it to `/uploaded/` **only after** a `200 OK`; retries resume after interruption.
- **Server upload endpoint** (`~/Dev/cassette-recorder/server/upload_server.py`, deployed
  to the Ubuntu box as its **own** systemd service on a separate port — does **not** touch
  Husk's `backend/api_server.py`). Flask, modeled on that file's `require_token` Bearer
  decorator: `POST /upload` validates the token, writes the body to
  `/srv/sketches-inbox/<YYYY-MM-DD_HHMM_devN>.wav`. The music plan's `audio_proxy`
  processor then picks it up.
- **Hardware/analog:** 3.5 mm line-in jack; coupling cap (~1 µF); 2× ~100 kΩ bias divider
  to 1.65 V; series + clamp diodes to 3V3/GND for input protection; optional RC anti-alias
  LPF below Fs/2.
- **Storage:** microSD SPI breakout (3.3 V) + card.
- **Power:** LiPo (1000–2000 mAh for WiFi-spike headroom) + charger (TP4056/protected) +
  a 3.3 V supply able to source ~600 mA peaks into the board's 3V3, with bulk capacitance
  to prevent **WiFi-TX brownout resets** (the classic gotcha). On/off switch.
- **UI:** RECORD button (start/stop toggle) + optional SYNC button; 1–3 status LEDs driving
  the solid/confirm/sync/error patterns above.
- **Enclosure:** cassette case / small project box (~110×70×20 mm — roomy now that we
  dropped the 12 mm shell). Holes for line-in, USB-C, buttons, LEDs, switch.

## Build phases

- **Phase 0 — bench bring-up:** board + microSD breakout + input network on a breadboard.
- **Phase 1 — recording core (main risk):** ADC DMA → PSRAM ring → WAV to SD. Validate by
  playing the WAV on a computer.
- **Phase 2 — WiFi upload:** device POST + `upload_server.py` into `/srv/sketches-inbox`;
  confirm end-to-end into the proxy pipeline (a Husk `creative` entry appears).
- **Phase 3 — battery + controls:** LiPo/charging (brownout-safe), button/LED state machine.
- **Phase 4 — enclosure:** assemble into the case; jacks/buttons/LEDs.

## Bill of materials (rough, NOK)

| Item | ~NOK |
| --- | --- |
| Arduino Nano ESP32 | 200 (have) |
| microSD breakout + card | 60 |
| 3.5 mm jack + passives (caps/resistors/diodes) | 40 |
| LiPo + TP4056 charger + 3.3 V reg + switch | 120 |
| Buttons, LEDs, protoboard, wire | 50 |
| Case (cassette case / small box) | 40 |
| **Total beyond the board** | **~310** |

## Verification

1. **Audio quality (Phase 1):** record a 1 kHz tone and R20 line-out; pull the SD, play the
   WAV — check level (not clipping / not too quiet), noise floor, correct sample rate, and
   **no dropouts over 3+ minutes**.
2. **Upload path (Phase 2):** `curl -H "Authorization: Bearer …" -F file=@test.wav
   http://homeserver:PORT/upload` → file lands in `/srv/sketches-inbox`. Then from the
   device. Then confirm the music-plan `audio_proxy` run produces a playable Husk entry.
3. **Offline-then-sync (Phase 2/3):** record several clips with **no network** (away from
   home), power-cycle the device, then bring it onto the home WiFi — confirm all queued
   clips upload, get moved to `/uploaded/`, and appear as Husk entries; verify an
   interrupted sync resumes without duplicating or losing files.
4. **Battery (Phase 3):** full record→sync cycle on LiPo with **no brownout reset** during
   WiFi TX; note rough runtime. Confirm LED patterns (recording / saved / syncing / error).
5. **Integrated (Phase 4):** line-in → record → sync, entirely from the assembled case.

## Open points

- Confirm an **ADC1** analog pin on the Nano ESP32 (A0–A7 mapping) and the max stable
  `analogContinuous()` rate for clean mono.
- Verify the Nano ESP32's **battery/power-input** recommendation (feed regulated 3V3 vs a
  battery pin) and size the regulator + caps for WiFi current spikes.
- Sample format: 16 kHz vs 22.05 kHz, 8-bit (extra grit) vs 12→16-bit WAV.
- Whether `upload_server.py` lives in the cassette project (recommended, isolated) or as a
  new route in Husk's `backend/` (avoid — keeps Husk untouched).
- Later: device-side niceties (tiny OLED, gain trim pot, deep-sleep between sessions).
