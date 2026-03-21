# FunkyBeats

### Browser-based Electronic Music Production Studio

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-100%25-00b4d8?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=flat-square)
![No Build Required](https://img.shields.io/badge/Build%20Step-None-success?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Platform: Browser](https://img.shields.io/badge/Platform-Browser-blueviolet?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-ff69b4?style=flat-square)
![Made with Love](https://img.shields.io/badge/Made%20with-Love-red?style=flat-square)

---

FunkyBeats is a fully functional DAW (Digital Audio Workstation) that runs entirely in the browser. Inspired by FL Studio's workflow and aesthetic, it synthesizes every sound in real time using the **Web Audio API** — no samples, no server, no build pipeline. Open `index.html` and start making music.

---

## Screenshot

> _Place a screenshot of the application here._
>
> `![FunkyBeats DAW Interface](screenshot.png)`

---

## Feature Overview

### Transport and Global Controls

- Play, Stop, and Record buttons with keyboard shortcuts
- BPM range from 60 to 200 with direct numeric input
- Swing control (0–100%) for shuffle groove feel
- Four independent pattern slots for song arrangement
- WAV export at 44.1 kHz / 16-bit stereo

### Step Sequencer

- 16 steps per channel across 8 channels
- Steps grouped into four beats for visual clarity
- Per-step velocity editing via right-click
- Mute and Solo per channel in the sequencer row
- Live step highlight during playback with green glow indicator
- 16-step position indicator bar below the spectrum visualizer

### Piano Roll

- Canvas-rendered grid with click-to-place notes
- Targets Bass, Lead, and Pad channels
- Octave navigation (up/down buttons, range displayed)
- Note names and C-position markers on the keyboard sidebar
- Clear button to wipe the current channel's notes

### Mixer

- One channel strip per instrument plus a Master strip
- Volume fader (vertical, rotated range input)
- Stereo pan control
- Mute and Solo per channel
- Real-time VU meter with a green-to-yellow-to-red gradient
- dB level readout below each fader

### Effects Rack (Master Bus)

| Effect | Range | Notes |
|---|---|---|
| Reverb | 0–100% | Convolver with a synthesized impulse response (2s decay) |
| Delay | 0–100% | Feedback delay with automatic level scaling |
| Delay Time | 1/16 to 1/1 | BPM-synced in sixteenth-note increments |
| Filter | 100 Hz – 20 kHz | Master lowpass with resonance |
| Resonance | 0–30 | Q factor of the master filter |
| Distortion | 0–100% | Waveshaper curve at 4x oversampling |
| Compressor | 0–100% | Threshold and ratio scale together |
| Master Volume | 0–100% | Post-compressor output gain |

### Real-Time Visualizer

- Full-width spectrum analyser using a 2048-point FFT
- Runs continuously in the background regardless of active tab
- Bar graph rendered on an HTML5 Canvas element

---

## Audio Engine Architecture

All synthesis happens in the browser's Web Audio API node graph. No audio files are loaded or fetched.

```
 Channel Gains (x8)
       |
  Stereo Panners (x8)
       |
  +----+----+
  |         |
Filter   Reverb Convolver
  |         |
Distortion  Reverb Gain
  |         |
  +----+----+
       |
  Delay Loop (Delay Node + Feedback Gain)
       |
  Dynamics Compressor
       |
   Master Gain
       |
    Analyser
       |
   AudioContext.destination
```

### Drum Synths

Each drum voice is constructed from primitive oscillator and noise nodes. There are no sample buffers.

| Channel | Synthesis Method |
|---|---|
| **Kick** | Sine oscillator with exponential pitch envelope (160 Hz to 32 Hz over 120 ms), plus a brief sine click transient at 1200 Hz |
| **Snare** | Highpass-filtered white noise (2 kHz cutoff) blended with a triangle oscillator decaying from 220 Hz to 110 Hz |
| **HiHat** | White noise passed through a highpass filter at 7 kHz and a bandpass filter centered at 10 kHz |
| **Clap** | Three rapid noise bursts at 10 ms intervals through a 2500 Hz bandpass, followed by a filtered noise tail |
| **Perc** | Triangle oscillator dropping from 800 Hz to 200 Hz in 50 ms, mixed with bandpass-filtered noise at 4 kHz |

### Melodic Synths

| Channel | Synthesis Method |
|---|---|
| **Bass** | Sawtooth oscillator plus a sine sub-oscillator at the same frequency, through a lowpass filter with an exponential frequency envelope. Filter opens from 6x to 1.5x the fundamental frequency over 150 ms |
| **Lead** | Three oscillators: two detuned sawtooths (+0 and +0.5%) and one square wave at -0.5% detune, mixed and passed through a closing lowpass filter |
| **Pad** | Five sine oscillators detuned at -12, -5, 0, +5, and +12 cents, summed through a static lowpass filter with a slow 150 ms attack envelope |

A single pre-generated stereo white noise buffer (2 seconds) is shared by all drum voices to reduce memory allocations during playback.

---

## Presets

FunkyBeats ships with 15 artist-researched presets organized into four categories. Each preset defines BPM, step patterns, note sequences, and per-step velocities for all eight channels.

### Standard Patterns

| Preset | BPM | Character |
|---|---|---|
| Four on the Floor | 128 | Classic 4/4 kick, eighth-note hats, syncopated bass |
| Breakbeat | 140 | Irregular kick placement, full 16th-note hats with velocity taper |
| Minimal Techno | 132 | Sparse percussion, off-beat lead stabs |
| Deep House | 122 | Walking snare pattern, layered bass line |
| Drum & Bass | 174 | Syncopated kick, dense percussion, fast bass |

### Phonk D Style (Jackin House / Funky House)

Inspired by Dirk Brettraeger's releases on labels like Cajual, Guesthouse, and Robsoul. Characterized by ghost kicks, syncopated bass lines that answer rather than double the kick, and polyrhythmic percussion. Swing at 20–30% is recommended for all Phonk D presets.

| Preset | BPM | Character |
|---|---|---|
| Jackin Groove | 126 | Ghost kicks on steps 3 and 11, bass avoids kick positions, 16th-note hi-hats with heavy velocity variation |
| Filtered Disko | 124 | Classic off-beat disco hi-hats, octave-pump bass, tambourine percussion, off-beat stabs |
| Bumpin Percussion | 125 | Six-hit-per-bar conga polyrhythm carries the groove, minimal deep bass |
| Funky Stabs | 126 | Off-beat claps instead of backbeat, chromatic bass lick with passing tone, dense chord stabs |
| Deep Jackin | 123 | Sparse arrangement, single ghost kick on step 11, warm pad chords |

### Storken Style (Nu Disco / Italo Disco)

Inspired by Thomas Henriksson's recordings for Running Back, Storkenland, and Exploited Sound. Features major-key tonality, analog arpeggios, and euphoric melodic lines. Recommended settings: Reverb 30–40%, delay on 1/8 note.

| Preset | BPM | Character |
|---|---|---|
| Lille Vals | 125 | 3-against-4 polymetric percussion creates a waltz feel, ascending major-key bass arpeggio, bleeping lead |
| Skogsdisko | 124 | Pentatonic walking bass, off-beat tambourine, sparse bleeping melody |
| Italo Arpeggio | 127 | Full 16-step Bb major arpeggio in the lead, octave-pump bass, driving 16th-note hats |
| Scandi Cosmic | 123 | Wide melodic intervals, lush moving pads, spacious reverb-friendly arrangement |
| Stupidisco | 127 | High-energy pop-disco, shaker on every eighth note, bright radiating stabs |

### Thomas Hammann Style (Deep House / Minimal House)

Inspired by the Robert Johnson resident's releases on Workshop and 808 Mate. Characterized by extreme reduction, shuffle drums, acid-influenced bass lines, and syncopated chord hits. **Swing at 20–35% is essential for all Hammann presets.**

| Preset | BPM | Character |
|---|---|---|
| 808 Mate (Workshop) | 122 | Chromatic acid bass wriggle, minimal chord hints, no percussion at all |
| Liquid Night (Robert Johnson) | 120 | Syncopated off-beat piano chords as the central element, deep Am bass, warm pads |
| Wah-Wah Boogie | 118 | Velocity-varied off-beat lead stabs simulate a wah-wah guitar, Boogie walking bass in Am |
| Frankfurt Deep | 119 | Ultra-minimal Dm arrangement, bass and pad only, sparse hi-hats |
| Record Digger | 124 | Chicago House kick pattern, jazz-influenced Fm7 bass lick, Jazz Ride-feel percussion |

---

## Quick Start

No installation, no build step, no Node.js.

1. Download or clone the repository.
2. Open `index.html` in a modern browser.
3. Click **Play** or press **Space**.

```bash
git clone https://github.com/your-username/funkybeats.git
cd funkybeats
open index.html        # macOS
xdg-open index.html    # Linux
# or double-click index.html in Windows Explorer
```

To load a preset immediately, select one from the **PRESET** dropdown in the transport bar before pressing play.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Toggle Play / Pause |
| `Escape` | Stop and reset playhead |

Additional interactions:

| Interaction | Action |
|---|---|
| Left-click a step button | Toggle step on/off |
| Right-click an active step | Open velocity editor |
| Left-click the Piano Roll canvas | Place a note |
| Right-click a Piano Roll note | Remove the note |

---

## Project Structure

FunkyBeats is intentionally three files.

```
funkybeats/
  index.html    HTML structure, transport, tab layout, effects rack
  style.css     FL Studio-inspired dark theme, CSS custom properties
  app.js        Audio engine, sequencer state, preset data, full UI logic
```

`app.js` is organized into self-contained classes:

- `AudioEngine` — Web Audio API node graph construction and all synth voice methods
- `SequencerState` — Pattern storage for four patterns, eight channels, sixteen steps each
- `FunkyBeatsApp` — UI construction, event binding, scheduler loop, visualizer

The scheduler uses a standard Web Audio lookahead approach: a `setInterval` loop fires every 25 ms and schedules notes up to 100 ms ahead using precise `AudioContext` timestamps.

---

## Browser Compatibility

FunkyBeats requires the Web Audio API and ES6+ JavaScript. The following browsers are supported:

| Browser | Minimum Version | Notes |
|---|---|---|
| Chrome / Chromium | 66+ | Fully supported, recommended |
| Firefox | 76+ | Fully supported |
| Safari | 14.1+ | Fully supported |
| Edge | 79+ | Fully supported (Chromium-based) |
| Opera | 53+ | Fully supported |

**Mobile browsers:** The Web Audio API is available on iOS Safari 14.1+ and Chrome for Android. The layout is not optimized for small screens, but basic playback functions work.

**Note:** Browsers require a user gesture before allowing audio context creation. Click Play or any step button to initialize audio on first use.

---

## WAV Export

Click the **WAV** button in the transport bar to render the current pattern to a 44.1 kHz, 16-bit stereo WAV file. The render plays through the full effects chain (reverb, delay, filter, distortion, compressor) and writes an accurate offline render, not a screen capture.

The file is generated entirely in JavaScript using the `OfflineAudioContext` API and downloaded automatically via a temporary anchor element.

---

## License

MIT License

Copyright (c) 2026 FunkyBeats Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
