# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FunkyBeats is a browser-based DAW (Digital Audio Workstation) for electronic music production (House/Funk/Disco). Three files, zero dependencies, pure vanilla JS + Web Audio API. Works from `file://` — no server or build step needed.

## Development

```bash
# Open in browser (the only "build" step)
open index.html

# Validate JavaScript syntax
node -c app.js

# Check for forbidden innerHTML usage (security hook rejects it)
grep -n 'innerHTML' app.js
```

There are no tests, linters, or build tools. Validation is manual: open in browser, click steps, press Space to play.

## Critical Constraints

- **NEVER use innerHTML** — a pre-commit security hook rejects any file containing `innerHTML`. All DOM creation must use the `el()` helper function (line ~75 in app.js) or `document.createElement` + `textContent`.
- **Single IIFE** — all code in app.js is wrapped in `(() => { 'use strict'; ... })();`. All classes and constants live inside this closure.
- **No modules** — the app must work from `file://` without a server, so ES modules and fetch() for local files are not available.
- **Pointer events, not mouse events** — all interactive elements use `pointerdown/pointermove/pointerup` for combined mouse+touch support.

## Architecture

### Files

| File | Lines | Purpose |
|------|-------|---------|
| `app.js` | ~5800 | Everything: audio engine, sequencer state, UI, presets |
| `style.css` | ~2400 | FL Studio dark theme + responsive mobile styles |
| `index.html` | ~400 | Static DOM structure, tab panels, effects rack |

### Classes (all inside the IIFE in app.js)

1. **`SampleManager`** (~line 106) — Loads and stores WAV/MP3 AudioBuffers per channel.

2. **`AudioEngine`** (~line 131) — Web Audio API node graph. Creates all oscillators, filters, effects, and routing. Key architectural details:
   - 11 channels routed through per-channel EQ → pan → sidechain gain → bus (DRUMS or SYNTHS) → master filter → distortion → compressor → master gain → analyser → destination
   - Reverb and delay are parallel sends from each channel
   - `init()` is async (creates reverb impulse) and uses `_initPromise` to prevent race conditions on concurrent calls
   - `playChannel(idx, time, velocity, note, isOpen, noteLength)` is the single dispatch method that routes to `playKick()`, `playSnare()`, `playBass()`, etc.
   - `channelParams[]` stores per-channel synth parameters (tune/decay/tone/drive for drums, waveform/ADSR/cutoff/resonance/detune/glide for synths)

3. **`SequencerState`** (~line 1340) — Data model. 8 patterns, each with `{ stepsCount, channels[][], automation{} }`. Handles undo/redo (50 levels), pattern clipboard, song chain. Step data: `{ on, velocity, note, open, duration }`.

4. **`FunkyBeatsApp`** (~line 1568) — Main controller. Builds all UI, binds events, runs the scheduler, handles save/load/export. The lookahead scheduler (`scheduler()` method) fires every 25ms and schedules audio up to 100ms ahead using Web Audio timestamps.

### Pattern Data Structure

```
patterns[0..7] = {
  stepsCount: 16|32|64,
  channels: [11 channels][stepsCount steps] = { on, velocity, note, open, duration },
  automation: { "master-filter": [null|0.0-1.0, ...], "channel-5-cutoff": [...], ... }
}
```

### Audio Routing

```
Channel Gains (x11) → 3-Band EQ → Pan → Sidechain Gain
  ├→ Per-channel sends → Reverb/Delay
  └→ Bus (Drums 0-4 / Synths 5-10) → Bus Compressor
       → Master Filter → Distortion → Compressor → Master Gain → Destination
```

### Serialization

Project version is currently **5**. `deserializeProject()` handles migration from older versions (adding missing fields with defaults). Always increment version when changing the data model.

### Presets

The `PRESETS` constant contains 60 hardcoded patterns in 12 categories: Standard (5), Phonk D (5), Storken (5), Thomas Hammann (5), Classic Disco (5), Italo Disco (5), Chicago House (5), Deep House (5), Acid House (5), Tech House (5), Funky House (5), Pure Funk (5). Presets only set step data and BPM — they don't modify synth parameters or effects. `PRESET_META` stores artist, tags, and description for the preset browser UI.

### Deployment

The app is hosted at `https://funkybeats.celox.io/` on a VPS (69.62.121.168). Deploy via:
```bash
scp index.html app.js style.css root@69.62.121.168:/var/www/funkybeats.celox.io/
```

## Key Patterns

- **Sound preview on step click**: `previewStepSound()` method calls `audio.init()` then `audio.playChannel()`. Must handle first-click AudioContext initialization.
- **Variable pattern length**: Never use a hardcoded step count. Always call `this.state.getSteps()` for the current pattern's length.
- **UI rebuilds**: When pattern length or channel count changes, call `buildSequencerGrid()`, `buildStepIndicators()`, `drawPianoRoll()` etc. to rebuild the DOM.
- **Canvas rendering**: Piano roll, automation, and arrangement all use HTML5 Canvas with manual coordinate math. DPR-aware via `resizeCanvases()`.
- **Mobile responsive**: CSS media queries at 768px and 480px breakpoints. Bottom fixed tab bar on mobile. Hamburger menu hides secondary controls.
