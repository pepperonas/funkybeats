# FunkyBeats

### Browser-based Electronic Music Production Studio

<p align="center">
  <img src="funkybeats-w1024_clean.png" alt="FunkyBeats DAW Interface" width="1024">
</p>

<p align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-100%25-00b4d8?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=flat-square)
![No Build Required](https://img.shields.io/badge/Build%20Step-None-success?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Platform: Browser](https://img.shields.io/badge/Platform-Browser%20%2B%20Mobile-blueviolet?style=flat-square)
![Channels](https://img.shields.io/badge/Channels-11-ff6b35?style=flat-square)
![Synth Voices](https://img.shields.io/badge/Synth%20Voices-11-00ff87?style=flat-square)
![Presets](https://img.shields.io/badge/Presets-60+-bb86fc?style=flat-square)
![Effects](https://img.shields.io/badge/Effects-12-ff6bb5?style=flat-square)
![Patterns](https://img.shields.io/badge/Patterns-8-64ffda?style=flat-square)
![Steps](https://img.shields.io/badge/Steps-16%2F32%2F64-ffd93d?style=flat-square)
![Automation](https://img.shields.io/badge/Automation-Lanes-4fc3f7?style=flat-square)
![Sidechain](https://img.shields.io/badge/Sidechain-Pump-ff4757?style=flat-square)
![Undo](https://img.shields.io/badge/Undo%2FRedo-50%20Levels-8888a0?style=flat-square)
![Save](https://img.shields.io/badge/Save-localStorage%20%2B%20JSON-222240?style=flat-square)
![Export](https://img.shields.io/badge/Export-WAV%2044.1kHz-00b4d8?style=flat-square)
![Mobile](https://img.shields.io/badge/Mobile-Touch%20Optimized-00ff87?style=flat-square)
![Sample Rate](https://img.shields.io/badge/Sample%20Rate-44.1kHz-ff6b35?style=flat-square)
![Bit Depth](https://img.shields.io/badge/Bit%20Depth-16bit-ffd93d?style=flat-square)
![Bus Routing](https://img.shields.io/badge/Bus-Drums%20%2B%20Synths-bb86fc?style=flat-square)
![EQ](https://img.shields.io/badge/EQ-3%20Band%20Per%20Channel-4fc3f7?style=flat-square)
![Glide](https://img.shields.io/badge/Glide-303%20Style-00ff87?style=flat-square)
![Chord Types](https://img.shields.io/badge/Chords-Maj%2FMin%2F7th%2Fmin7-ff6bb5?style=flat-square)
![Samples](https://img.shields.io/badge/Samples-WAV%2FMP3%20Import-64ffda?style=flat-square)
![Ghost Notes](https://img.shields.io/badge/Ghost%20Notes-Piano%20Roll-bb86fc?style=flat-square)
![Groove Pool](https://img.shields.io/badge/Groove-MPC%2F808%2FHuman-ff6b35?style=flat-square)
![Scale Lock](https://img.shields.io/badge/Scale%20Lock-8%20Scales-00ff87?style=flat-square)
![Euclidean](https://img.shields.io/badge/Euclidean-Sequencer-4fc3f7?style=flat-square)
![Probability](https://img.shields.io/badge/Step-Probability-ffd93d?style=flat-square)
![Spectrum](https://img.shields.io/badge/Spectrum-Analyzer-ff4757?style=flat-square)
![Clip Launcher](https://img.shields.io/badge/Clip-Launcher-ff6bb5?style=flat-square)
![AI Generate](https://img.shields.io/badge/AI-Track%20Generator-bb86fc?style=flat-square)
![Lines of Code](https://img.shields.io/badge/Code-10%2C000%20Lines-222240?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-ff69b4?style=flat-square)
![Made with Love](https://img.shields.io/badge/Made%20with-Love-red?style=flat-square)

</p>

---

FunkyBeats is a fully functional DAW (Digital Audio Workstation) that runs entirely in the browser. Inspired by FL Studio, it synthesizes every sound in real time using the **Web Audio API** -- no samples required, no server, no build pipeline. Open `index.html` and start producing House, Funk, and Disco tracks.

---

## Quick Start

No installation, no build step, no Node.js.

```bash
git clone https://github.com/pepperonas/funkybeats.git
cd funkybeats
open index.html        # macOS
xdg-open index.html    # Linux
# or double-click index.html in Windows Explorer
```

Click any step in the sequencer to hear the sound. Press **Space** to play.

---

## Feature Overview

### Step Sequencer

- **11 channels**: Kick, Snare, HiHat, Clap, Perc, Bass, Lead, Pad, Chord, Stab, Organ
- **Variable pattern length**: 16, 32, or 64 steps per pattern
- **8 independent patterns** with copy/paste/clear
- Drag-to-paint: click and drag across steps to toggle multiple
- Sound preview on step activation -- hear the sound when you place it
- **Euclidean sequencer**: Bjorklund algorithm generates optimal patterns per channel (hits + rotation)
- **Step probability**: 25-100% chance per step, visual dashed border for probabilistic steps
- Mute/Solo per channel
- Open HiHat toggle (Shift+Click) with closed-hat choke
- Live playhead with step indicators

### Piano Roll

- Canvas-based note editor for all melodic channels (Bass, Lead, Pad, Chord, Stab, Organ)
- **Ghost Notes**: see other channels' notes transparently in the background (toggle GHOST button)
- **Scale Lock**: select root note (C-B) + scale (Major, Minor, Dorian, Mixolydian, Pentatonic, Blues, Harmonic Minor) -- non-scale notes dimmed, SNAP button quantizes input
- **Variable note length**: drag right to extend notes across steps
- **Velocity lane**: bottom 60px for per-note velocity editing via click/drag
- **Zoom**: Ctrl+Wheel to zoom, Shift+Wheel to scroll
- **Selection mode**: click-drag to select, Ctrl+C/V to copy/paste notes
- Octave navigation (1-7 range)
- QWERTY keyboard input (Z-M = C-B, Shift = octave up, respects scale snap)

### Automation Lanes

- Dedicated **AUTOMATION** tab with canvas curve editor
- Click to set points, drag to draw curves, right-click to delete
- Automatable parameters:
  - Master: Filter, Resonance, Reverb, Delay, Distortion
  - Per-channel: Volume, Filter Cutoff
- Smooth playback via Web Audio `linearRampToValueAtTime`
- **Filter sweeps are the #1 production technique in Disco/House -- now fully supported**

### Synth Editor

- Per-channel sound design panel
- **Drum channels** (Kick/Snare/HiHat/Clap/Perc): Tune, Decay, Tone, Drive
- **Synth channels** (Bass/Lead/Pad/Chord/Stab/Organ): Waveform, Attack, Decay, Cutoff, Resonance, Detune, Glide
- **Chord channel**: selectable chord type (Major, Minor, 7th, min7)
- **Sample playback**: load WAV/MP3 files to replace synthesis on any channel

### Mixer

- Volume fader + stereo pan per channel
- **3-band EQ** per channel (Low 80Hz / Mid 1kHz / High 8kHz, +/-12dB)
- **Per-channel reverb/delay sends**
- **Real VU meters** with per-channel AnalyserNodes, peak hold, and clip indicators
- Mute/Solo per channel
- **DRUMS bus** and **SYNTHS bus** with independent compressors
- Master channel with master fader

### Effects Rack

| Effect | Range | Type |
|--------|-------|------|
| Reverb | 0-100% | Convolver with synthesized 2s impulse response |
| Delay | 0-100% | Feedback delay with BPM sync (1/16 to 1/1) |
| Filter | 100Hz-20kHz | Master lowpass |
| Resonance | 0-30 | Filter Q |
| Distortion | 0-100% | Waveshaper, 4x oversampling |
| Compressor | 0-100% | Dynamic threshold/ratio |
| Chorus | 0-100% | Dual detuned delay lines with LFO |
| Phaser | 0-100% | Allpass filter chain with LFO |
| Flanger | 0-100% | Short modulated delay with feedback |
| Bitcrusher | 0-100% | Bit depth and sample rate reduction |
| Master Volume | 0-100% | Post-compressor output gain |

### Sidechain Pump

- Kick-triggered ducking on all non-kick channels
- Configurable source channel (not just kick)
- Amount and Release controls
- **The classic House/EDM pumping effect**

### Arrangement View

- Full playlist/timeline replacing the simple song chain
- **8 tracks x 64 bars** canvas-based arrangement
- Paint pattern blocks onto tracks
- Playback position indicator
- Context menus for editing

### Clip Launcher / Perform Mode

- **PERFORM** tab with 8x11 grid (8 patterns x 11 channels)
- Click cells to assign channels to different patterns -- Kick from Pattern 1, Bass from Pattern 3
- Changes are quantized to bar boundaries for seamless transitions
- Three playback modes: **PAT** (single pattern), **SONG** (arrangement), **PERF** (clip launcher)
- Live DJ-style performance mixing like Ableton Session View

### Spectrum Analyzer

- **128-bar FFT** frequency display with peak-hold lines
- **Per-channel VU meters** with real AnalyserNode data (not simulated)
- dB scale labels (0, -12, -24, -48 dB)
- **Clip indicators**: flash red when signal exceeds threshold
- Continuous animation loop for real-time visual feedback

### Song Mode

- Pattern chain with loop toggle
- Click slots to cycle patterns 1-8
- Add/Remove/Clear controls
- Switch between Pattern, Song, and Perform playback modes

### Transport

- Play, Stop, Record with keyboard shortcuts
- BPM 60-200 with direct input
- **Tap Tempo** (T key or TAP button)
- Swing 0-100%
- **Groove Pool**: MPC, TR-808, Human, Lazy, Push groove templates with per-step timing offsets
- **Per-channel swing**: each channel can override global swing for independent groove feel
- **Metronome** with dedicated audio path (bypasses effects)
- Pattern selector (8 slots) with copy/paste/clear tools

### Save/Load

- **Auto-save** to localStorage on every edit
- Named project save/load via localStorage
- **JSON export/import** for backup and sharing
- WAV export (44.1kHz / 16-bit stereo via OfflineAudioContext)

### Workflow

- **Undo/Redo**: 50-level history (Ctrl+Z / Ctrl+Shift+Z)
- **Humanize**: timing and velocity randomization
- **Context menus**: right-click on steps, notes, and arrangement blocks
- **Keyboard shortcuts help**: press ? for full shortcut overlay
- **Preset browser** with search and tag filtering
- **AI Track Generator**: describe a track in natural language, Claude generates it (password-protected backend)

---

## Audio Engine Architecture

All synthesis happens in the Web Audio API node graph. No audio files are loaded.

```
Channel Gains (x11)
      |
 Per-Channel 3-Band EQ (Low/Mid/High)
      |
 Stereo Panners
      |
 Sidechain Gain (per channel, ducked by configurable source)
      |
 Per-Channel Sends -----> Reverb Convolver -> Reverb Gain -+
      |              \---> Delay -> Feedback Loop -> Delay Gain -+
      |                                                          |
 Bus Routing:                                                    |
   Drums (Ch 0-4) -> Drum Bus Compressor -+                     |
   Synths (Ch 5-10) -> Synth Bus Comp. ---+                     |
                                          |                      |
                                    Master Filter                |
                                          |                      |
                                    Distortion (4x OS)           |
                                          |                      |
                                 Dynamics Compressor             |
                                          |                      |
                                     Master Gain <---------------+
                                          |
                                       Analyser
                                          |
                                  AudioContext.destination

 Metronome Gain ---------> destination (bypasses all effects)
```

### Synth Voices (11 total)

| Channel | Synthesis |
|---------|-----------|
| **Kick** | Sine osc with pitch envelope (150-50Hz), sub layer, click transient |
| **Snare** | Highpass noise + triangle osc with pitch sweep |
| **HiHat** | Bandpass + highpass noise, open/closed variants with choke |
| **Clap** | Triple noise burst + filtered tail |
| **Perc** | Triangle osc pitch drop + bandpass noise |
| **Bass** | Dual detuned osc + lowpass filter with envelope, glide support |
| **Lead** | Triple detuned osc (saw/square) + filter sweep |
| **Pad** | Multi-osc cluster with slow attack, LP filter |
| **Chord** | Triad/7th generator (Major/Minor/7th/min7), detuned for warmth |
| **Stab** | Short filtered burst, high resonance bandpass, fast decay |
| **Organ** | Additive synthesis with harmonic drawbars |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `Esc` | Stop + close modals |
| `T` | Tap Tempo |
| `1-8` | Select Pattern |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save Project |
| `Ctrl+C` | Copy (pattern or piano roll selection) |
| `Ctrl+V` | Paste |
| `Delete` | Delete selected notes |
| `?` | Toggle shortcuts help |
| `Z S X D C V G B H N J M` | Piano keys C through B |
| `Shift` + piano key | Octave up |
| `Shift+Click` (HiHat) | Toggle open hat |
| `Drag` (Sequencer) | Paint multiple steps |
| `Ctrl+Wheel` (Piano Roll) | Zoom |
| `Shift+Wheel` (Piano Roll) | Horizontal scroll |
| `Right-click` | Context menu |

---

## Presets (60+)

FunkyBeats ships with 60 production-ready presets across 12 categories. Each preset defines BPM, step patterns, note sequences, and per-step velocities. Presets are designed based on researched genre characteristics and serve as project starting points.

### Standard Patterns (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Four on the Floor | 128 | Classic 4/4 kick, eighth-note hats, syncopated bass |
| Breakbeat | 140 | Irregular kick, full 16th hats with velocity taper |
| Minimal Techno | 132 | Sparse percussion, off-beat lead stabs |
| Deep House | 122 | Walking snare pattern, layered bass line |
| Drum & Bass | 174 | Syncopated kick, dense percussion, fast bass |

### Artist Presets (15)

**Phonk D** (Jackin/Funky House, 123-126 BPM) -- Ghost kicks, syncopated bass, polyrhythmic percussion. Swing 20-30%.

**Storken** (Nu Disco/Italo, 123-127 BPM) -- Major-key arpeggios, euphoric melodies, analog bleeps. Reverb 30-40%.

**Thomas Hammann** (Deep/Minimal House, 118-124 BPM) -- Extreme reduction, shuffle drums, acid bass. Swing 20-35%.

### Classic Disco (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Donna | 126 | "I Feel Love" sequenced C-Dur bass arpeggio, lush pads |
| Chic | 116 | "Le Freak" groove, Em walking bass, funky off-beat stabs |
| String Heaven | 118 | Orchestral disco, big Am7 pad voicings, melodic bass |
| Roller | 112 | Roller disco bounce, Gm octave-pump bass, organ comping |
| Mirror Ball | 120 | Studio 54 full arrangement, Cm, lead + stabs + pad + bass |

### Italo Disco (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Dolce Vita | 120 | Ryan Paris vibe, Am arpeggio bass, full 16-step lead sequence |
| Synth Chase | 128 | Action-movie italo, Em driving arpeggio, stab accents |
| Romance | 118 | Romantic italo, Dm pad-led, slow melody, soft drums |
| Machine | 126 | Machine rhythm, even 16th hats, sequenced Cm bass + lead |
| Cosmic | 122 | Cosmic italo, Em spacey pads, wide intervals, off-beat perc |

### Chicago House (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Warehouse | 124 | Frankie Knuckles Fm, raw drums, syncopated piano chord stabs |
| Piano | 122 | Piano house, dense Cm chord pattern, walking bass |
| Vocal | 126 | Vocal house Am, stab channel as rhythmic "vocal chops" |
| Jack | 126 | Jackin house, syncopated kick with ghost hits, 16th hats |
| Classic | 124 | Mr. Fingers "Can You Feel It", warm Dm pads, minimal drums |

### Deep House (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Midnight | 120 | Dm rolling bass, warm organ chords, atmospheric pad |
| Jazz | 122 | Jazz house Am7, walking bass, ride perc, 7th chord voicings |
| Ocean | 118 | Dub deep Em, ultra-minimal, sparse bass, lush pad |
| Soul | 121 | Soulful Gm, organ comping, melodic lead, warm bass |
| Rhodes | 120 | Rhodes piano Dm7, jazz chord voicings, subtle perc |

### Acid House (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| 303 | 126 | Phuture "Acid Tracks", chromatic wriggling bass, minimal drums |
| Warehouse | 124 | Warehouse acid, raw kick, off-beat clap, 303 chromatik |
| Mental | 128 | Mental acid, fast 16-step Cm bass sequence, driving hats |
| Deep | 122 | Deep acid, hypnotic, few notes with glide, dark Cm pad |
| Electro | 130 | Electro acid, hard kick, snare rolls, aggressive chromatic bass |

### Tech House (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Groove | 126 | Groove tech Am, punchy kick, off-beat hats, conga perc |
| Minimal | 128 | Ultra minimal Cm, only kick + hihat + bass, hypnotic |
| Percussive | 127 | Heavy percussion Am, 6-hit conga polyrhythm, stab accents |
| Dark | 130 | Dark tech Cm, ghost 16th hats, sparse lead stabs |
| Funky | 125 | Funky tech Em, disco elements, chord stabs, boogie bass |

### Funky House (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| Sample | 124 | Sample house Am, organ riff, off-beat funk bass |
| Diva | 126 | Diva house Cm, big lead melody, disco octave-pump bass, stabs |
| Bounce | 128 | Bouncy Em, octave bass pump, tambourine perc, chord stabs |
| Filter | 124 | Filter house Cm, dense arrangement for filter sweep automation |
| Classics | 122 | Nu-disco Dm, retro walking bass, off-beat stabs, warm pad |

### Pure Funk (5)

| Preset | BPM | Character |
|--------|-----|-----------|
| James | 100 | James Brown "The One", Em, beat-1 emphasis, syncopated kick, organ |
| Parliament | 105 | Parliament/Funkadelic Gm, heavy syncopation, slap bass, synth lead |
| EWF | 108 | Earth Wind & Fire Cm, horn-like stabs + chords, melodic bass |
| Slap | 98 | Slap bass Am, octave jumps, ghost notes, 16th hats, organ comping |
| Groove | 95 | Deep funk Dm, slow hypnotic groove, interlocking elements, organ + pad |

---

## Mobile Support

FunkyBeats is fully responsive and touch-optimized:

- **Bottom tab bar** on mobile (fixed, 6 tabs)
- **Touch-friendly targets** (44px minimum)
- **On-screen piano keyboard** for note input without QWERTY
- **Pinch-to-zoom** on piano roll
- **Swipe** between tabs
- **Long-press** for context menus (replaces right-click)
- **Floating play/stop button**
- **Hamburger menu** for pattern tools and save/load on small screens
- Optimized for Samsung Galaxy S24 Ultra (412x915px)

---

## Project Structure

Three files, zero dependencies, ~10,000 lines of code.

```
funkybeats/
  index.html    Structure, transport, 7 tabs, effects rack (509 lines)
  style.css     FL Studio dark theme, responsive, mobile (2,847 lines)
  app.js        Audio engine, sequencer, 60 presets, all features (6,615 lines)
```

### Classes in app.js

- `AudioEngine` -- Web Audio node graph, 11 synth voices, per-channel AnalyserNodes, effects chain, bus routing, sidechain, sample manager
- `SequencerState` -- 8 patterns with variable length, undo/redo, clipboard, song chain, automation, euclidean algorithm, step probability
- `FunkyBeatsApp` -- UI construction, event binding, scheduler with per-channel swing + groove templates, ghost notes, scale lock, clip launcher, AI integration, visualizer, save/load

---

## Browser Compatibility

| Browser | Minimum | Notes |
|---------|---------|-------|
| Chrome / Chromium | 66+ | Recommended |
| Firefox | 76+ | Fully supported |
| Safari | 14.1+ | Fully supported |
| Edge | 79+ | Chromium-based |
| Chrome Android | 66+ | Touch optimized |
| iOS Safari | 14.1+ | Touch optimized |

---

## License

MIT License

Copyright (c) 2026 FunkyBeats Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
