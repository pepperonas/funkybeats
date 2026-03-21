// ============================================
// FUNKYBEATS - Complete Electronic Music Producer
// Web Audio API Synthesized DAW Clone
// ============================================

(() => {
    'use strict';

    // ---- Constants ----
    const STEPS = 16;
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const BLACK_KEYS = [1, 3, 6, 8, 10];
    const CHANNELS = [
        { name: 'Kick', type: 'drum', color: '#ff6b35', synth: 'kick' },
        { name: 'Snare', type: 'drum', color: '#ffd93d', synth: 'snare' },
        { name: 'HiHat', type: 'drum', color: '#4fc3f7', synth: 'hihat' },
        { name: 'Clap', type: 'drum', color: '#bb86fc', synth: 'clap' },
        { name: 'Perc', type: 'drum', color: '#ff4757', synth: 'perc' },
        { name: 'Bass', type: 'synth', color: '#00ff87', synth: 'bass' },
        { name: 'Lead', type: 'synth', color: '#ff6bb5', synth: 'lead' },
        { name: 'Pad', type: 'synth', color: '#64ffda', synth: 'pad' },
    ];

    // ---- DOM Helper ----
    function el(tag, attrs, children) {
        const elem = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'text') elem.textContent = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(elem.style, v);
                else if (k === 'className') elem.className = v;
                else if (k.startsWith('data')) elem.setAttribute(k.replace(/([A-Z])/g, '-$1').toLowerCase(), v);
                else elem.setAttribute(k, v);
            }
        }
        if (children) {
            for (const child of (Array.isArray(children) ? children : [children])) {
                if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
                else if (child) elem.appendChild(child);
            }
        }
        return elem;
    }

    // ---- Audio Engine ----
    class AudioEngine {
        constructor() {
            this.ctx = null;
            this.masterGain = null;
            this.analyser = null;
            this.compressor = null;
            this.reverbNode = null;
            this.reverbGain = null;
            this.delayNode = null;
            this.delayFeedback = null;
            this.delayGain = null;
            this.filterNode = null;
            this.distortionNode = null;
            this.channelGains = [];
            this.channelPans = [];
            this.channelMuted = new Array(CHANNELS.length).fill(false);
            this.channelSolo = new Array(CHANNELS.length).fill(false);
            this.noiseBuffer = null;
            this.initialized = false;
        }

        async init() {
            if (this.initialized) return;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();

            // Create noise buffer for snare/hihat/clap
            this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 2048;

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.8;

            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -24;
            this.compressor.knee.value = 30;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.25;

            this.filterNode = this.ctx.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.value = 20000;
            this.filterNode.Q.value = 0;

            this.distortionNode = this.ctx.createWaveShaper();
            this.distortionNode.curve = this.makeDistortionCurve(0);
            this.distortionNode.oversample = '4x';

            // Reverb
            this.reverbNode = this.ctx.createConvolver();
            this.reverbNode.buffer = this.createReverbImpulse(2, 2);
            this.reverbGain = this.ctx.createGain();
            this.reverbGain.gain.value = 0.2;

            // Delay
            this.delayNode = this.ctx.createDelay(2);
            this.delayNode.delayTime.value = 60 / 128 / 2;
            this.delayFeedback = this.ctx.createGain();
            this.delayFeedback.gain.value = 0.3;
            this.delayGain = this.ctx.createGain();
            this.delayGain.gain.value = 0;

            this.delayNode.connect(this.delayFeedback);
            this.delayFeedback.connect(this.delayNode);
            this.delayNode.connect(this.delayGain);

            for (let i = 0; i < CHANNELS.length; i++) {
                const gain = this.ctx.createGain();
                gain.gain.value = 0.7;
                const pan = this.ctx.createStereoPanner();
                pan.pan.value = 0;
                gain.connect(pan);
                pan.connect(this.filterNode);
                pan.connect(this.reverbNode);
                pan.connect(this.delayNode);
                this.channelGains.push(gain);
                this.channelPans.push(pan);
            }

            this.filterNode.connect(this.distortionNode);
            this.distortionNode.connect(this.compressor);
            this.reverbGain.connect(this.compressor);
            this.delayGain.connect(this.compressor);
            this.reverbNode.connect(this.reverbGain);
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);

            this.initialized = true;
        }

        createReverbImpulse(duration, decay) {
            const length = this.ctx.sampleRate * duration;
            const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
                }
            }
            return impulse;
        }

        makeDistortionCurve(amount) {
            const k = amount;
            const samples = 44100;
            const curve = new Float32Array(samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                curve[i] = k === 0 ? x : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            }
            return curve;
        }

        getDestination(channelIndex) {
            return this.channelGains[channelIndex];
        }

        isChannelAudible(channelIndex) {
            const hasSolo = this.channelSolo.some(s => s);
            if (hasSolo) return this.channelSolo[channelIndex];
            return !this.channelMuted[channelIndex];
        }

        // ---- Synth voices ----
        playKick(time, velocity, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const v = velocity * 0.9;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(160, time);
            osc.frequency.exponentialRampToValueAtTime(32, time + 0.12);
            gain.gain.setValueAtTime(v, time);
            gain.gain.setValueAtTime(v * 0.9, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(time);
            osc.stop(time + 0.45);

            const click = ctx.createOscillator();
            const clickGain = ctx.createGain();
            click.type = 'sine';
            click.frequency.setValueAtTime(1200, time);
            click.frequency.exponentialRampToValueAtTime(100, time + 0.02);
            clickGain.gain.setValueAtTime(v * 0.5, time);
            clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
            click.connect(clickGain);
            clickGain.connect(dest);
            click.start(time);
            click.stop(time + 0.04);
        }

        playSnare(time, velocity, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const v = velocity * 0.7;

            const noise = ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = 2000;
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(v, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(dest);
            noise.start(time);
            noise.stop(time + 0.25);

            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, time);
            osc.frequency.exponentialRampToValueAtTime(110, time + 0.04);
            oscGain.gain.setValueAtTime(v * 0.6, time);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            osc.connect(oscGain);
            oscGain.connect(dest);
            osc.start(time);
            osc.stop(time + 0.12);
        }

        playHihat(time, velocity, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const v = velocity * 0.4;

            const noise = ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 7000;
            const bandpass = ctx.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.value = 10000;
            bandpass.Q.value = 1;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(v, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
            noise.connect(filter);
            filter.connect(bandpass);
            bandpass.connect(gain);
            gain.connect(dest);
            noise.start(time);
            noise.stop(time + 0.1);
        }

        playClap(time, velocity, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const v = velocity * 0.6;

            for (let i = 0; i < 3; i++) {
                const t = time + i * 0.01;
                const noise = ctx.createBufferSource();
                noise.buffer = this.noiseBuffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 2500;
                filter.Q.value = 3;
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(v * 0.7, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(dest);
                noise.start(t);
                noise.stop(t + 0.05);
            }

            const tail = ctx.createBufferSource();
            tail.buffer = this.noiseBuffer;
            const tailFilter = ctx.createBiquadFilter();
            tailFilter.type = 'bandpass';
            tailFilter.frequency.value = 2500;
            tailFilter.Q.value = 2;
            const tailGain = ctx.createGain();
            tailGain.gain.setValueAtTime(v, time + 0.03);
            tailGain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
            tail.connect(tailFilter);
            tailFilter.connect(tailGain);
            tailGain.connect(dest);
            tail.start(time + 0.03);
            tail.stop(time + 0.35);
        }

        playPerc(time, velocity, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const v = velocity * 0.5;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(800, time);
            osc.frequency.exponentialRampToValueAtTime(200, time + 0.05);
            gain.gain.setValueAtTime(v, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(time);
            osc.stop(time + 0.15);

            const noise = ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const nGain = ctx.createGain();
            const nFilter = ctx.createBiquadFilter();
            nFilter.type = 'bandpass';
            nFilter.frequency.value = 4000;
            nGain.gain.setValueAtTime(v * 0.3, time);
            nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
            noise.connect(nFilter);
            nFilter.connect(nGain);
            nGain.connect(dest);
            noise.start(time);
            noise.stop(time + 0.05);
        }

        playBass(time, velocity, note, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const freq = this.noteToFreq(note);
            const v = velocity * 0.6;

            const osc1 = ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.value = freq;

            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = freq;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 6, time);
            filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.15);
            filter.Q.value = 5;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(v, time + 0.005);
            gain.gain.setValueAtTime(v * 0.8, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

            const subGain = ctx.createGain();
            subGain.gain.value = 0.4;

            osc1.connect(filter);
            osc2.connect(subGain);
            subGain.connect(filter);
            filter.connect(gain);
            gain.connect(dest);

            osc1.start(time);
            osc2.start(time);
            osc1.stop(time + 0.35);
            osc2.stop(time + 0.35);
        }

        playLead(time, velocity, note, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const freq = this.noteToFreq(note);
            const v = velocity * 0.35;

            const osc1 = ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.value = freq;

            const osc2 = ctx.createOscillator();
            osc2.type = 'sawtooth';
            osc2.frequency.value = freq * 1.005;

            const osc3 = ctx.createOscillator();
            osc3.type = 'square';
            osc3.frequency.value = freq * 0.995;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 8, time);
            filter.frequency.exponentialRampToValueAtTime(freq * 2, time + 0.3);
            filter.Q.value = 3;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(v, time + 0.01);
            gain.gain.setValueAtTime(v * 0.7, time + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

            const mixGain = ctx.createGain();
            mixGain.gain.value = 0.4;

            osc1.connect(filter);
            osc2.connect(mixGain);
            osc3.connect(mixGain);
            mixGain.connect(filter);
            filter.connect(gain);
            gain.connect(dest);

            osc1.start(time);
            osc2.start(time);
            osc3.start(time);
            osc1.stop(time + 0.45);
            osc2.stop(time + 0.45);
            osc3.stop(time + 0.45);
        }

        playPad(time, velocity, note, channelIdx) {
            if (!this.isChannelAudible(channelIdx)) return;
            const ctx = this.ctx;
            const dest = this.getDestination(channelIdx);
            const freq = this.noteToFreq(note);
            const v = velocity * 0.2;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(v, time + 0.15);
            gain.gain.setValueAtTime(v * 0.8, time + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = freq * 4;
            filter.Q.value = 1;

            filter.connect(gain);
            gain.connect(dest);

            for (const d of [-12, -5, 0, 5, 12]) {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.detune.value = d;
                const oscGain = ctx.createGain();
                oscGain.gain.value = 0.25;
                osc.connect(oscGain);
                oscGain.connect(filter);
                osc.start(time);
                osc.stop(time + 0.85);
            }
        }

        noteToFreq(note) {
            return 440 * Math.pow(2, (note - 69) / 12);
        }

        playSynth(synthName, time, velocity, note, channelIdx) {
            switch (synthName) {
                case 'kick': this.playKick(time, velocity, channelIdx); break;
                case 'snare': this.playSnare(time, velocity, channelIdx); break;
                case 'hihat': this.playHihat(time, velocity, channelIdx); break;
                case 'clap': this.playClap(time, velocity, channelIdx); break;
                case 'perc': this.playPerc(time, velocity, channelIdx); break;
                case 'bass': this.playBass(time, velocity, note, channelIdx); break;
                case 'lead': this.playLead(time, velocity, note, channelIdx); break;
                case 'pad': this.playPad(time, velocity, note, channelIdx); break;
            }
        }

        setReverb(amount) {
            this.reverbGain.gain.linearRampToValueAtTime(amount, this.ctx.currentTime + 0.05);
        }

        setDelay(amount) {
            this.delayGain.gain.linearRampToValueAtTime(amount, this.ctx.currentTime + 0.05);
            this.delayFeedback.gain.value = Math.min(amount * 0.7, 0.85);
        }

        setDelayTime(sixteenths, bpm) {
            const beatSec = 60 / bpm;
            const time = (beatSec / 4) * sixteenths;
            this.delayNode.delayTime.linearRampToValueAtTime(Math.min(time, 2), this.ctx.currentTime + 0.05);
        }

        setFilter(freq) {
            this.filterNode.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.05);
        }

        setResonance(q) {
            this.filterNode.Q.value = q;
        }

        setDistortion(amount) {
            this.distortionNode.curve = this.makeDistortionCurve(amount * 50);
        }

        setCompressor(amount) {
            this.compressor.threshold.value = -50 + (1 - amount) * 40;
            this.compressor.ratio.value = 1 + amount * 15;
        }

        setMasterVolume(v) {
            this.masterGain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.05);
        }

        setChannelVolume(idx, v) {
            this.channelGains[idx].gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.05);
        }

        setChannelPan(idx, v) {
            this.channelPans[idx].pan.linearRampToValueAtTime(v, this.ctx.currentTime + 0.05);
        }
    }

    // ---- Sequencer State ----
    class SequencerState {
        constructor() {
            this.patterns = [];
            for (let p = 0; p < 4; p++) {
                const pattern = [];
                for (let ch = 0; ch < CHANNELS.length; ch++) {
                    const steps = [];
                    for (let s = 0; s < STEPS; s++) {
                        steps.push({
                            on: false,
                            velocity: 0.8,
                            note: ch >= 5 ? 48 : 0,
                        });
                    }
                    pattern.push(steps);
                }
                this.patterns.push(pattern);
            }
            this.currentPattern = 0;
        }

        get pattern() {
            return this.patterns[this.currentPattern];
        }

        toggle(channel, step) {
            const s = this.pattern[channel][step];
            s.on = !s.on;
            return s.on;
        }

        clear(channel) {
            for (let s = 0; s < STEPS; s++) {
                this.pattern[channel][s].on = false;
            }
        }

        clearAll() {
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                this.clear(ch);
            }
        }
    }

    // ---- Preset Patterns ----
    const PRESETS = {
        'four-on-floor': {
            bpm: 128,
            steps: {
                0: { on: [0,4,8,12] },
                1: { on: [4,12] },
                2: { on: [0,2,4,6,8,10,12,14] },
                3: { on: [4,12], velocity: [,,,, 0.9,,,,,,,,0.7] },
                5: { on: [0,3,6,10,12], notes: [36,36,39,36,41] },
                7: { on: [0,8], notes: [60,64] },
            }
        },
        'breakbeat': {
            bpm: 140,
            steps: {
                0: { on: [0,3,6,10,14] },
                1: { on: [4,12] },
                2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.8,0.4,0.6,0.4,0.8,0.4,0.6,0.4,0.8,0.4,0.6,0.4,0.8,0.4,0.6,0.4] },
                3: { on: [4,11] },
                4: { on: [2,8,14] },
                5: { on: [0,6,10,12], notes: [36,39,36,41] },
            }
        },
        'minimal-techno': {
            bpm: 132,
            steps: {
                0: { on: [0,4,8,12] },
                2: { on: [2,6,10,14], velocity: [,, 0.5,,,,0.5,,,,0.5,,,,0.5] },
                3: { on: [4] },
                4: { on: [7,15] },
                5: { on: [0,8,10], notes: [36,36,39] },
                6: { on: [6,14], notes: [72,75] },
            }
        },
        'deep-house': {
            bpm: 122,
            steps: {
                0: { on: [0,4,8,12] },
                1: { on: [4,12] },
                2: { on: [0,2,4,6,8,10,12,14], velocity: [0.6,0.3,0.7,0.3,0.6,0.3,0.7,0.3,0.6,0.3,0.7,0.3,0.6,0.3,0.7,0.3] },
                3: { on: [3,11] },
                5: { on: [0,3,6,8,10,14], notes: [36,36,38,36,41,39] },
                7: { on: [0], notes: [60] },
            }
        },
        'drum-n-bass': {
            bpm: 174,
            steps: {
                0: { on: [0,6,10] },
                1: { on: [4,12] },
                2: { on: [0,2,4,6,8,10,12,14] },
                3: { on: [4,7,12,15] },
                4: { on: [2,10] },
                5: { on: [0,3,6,8,10,14], notes: [36,39,36,41,36,43] },
            }
        },

        // ========== PHONK D (Dirk Brettraeger) STYLE PRESETS ==========
        // Jackin House / Funky House — 124-126 BPM, synkopierte Kicks,
        // shuffled HiHats, polyrhythm. Percussion, Funk-Bass der den Kick beantwortet,
        // gefilterte Disco-Stabs. Swing auf 20-30% empfohlen.

        // 1. Jackin Groove — Signature-Sound: Ghost-Kicks erzeugen den "Jackin"-Push,
        //    Bass synkopiert GEGEN die Kick (antwortet statt mitzulaufen),
        //    16tel-Hats mit starker Velocity-Abstufung fuer Shuffle-Gefuehl,
        //    Off-Beat Claps + Conga-Polyrhythmik
        'phonk-jackin': {
            bpm: 126,
            steps: {
                // Kick: 4otf Grundgeruest (0,4,8,12) + Ghost-Hits auf 3,11 = Jackin-Synkope
                0: { on: [0,3,4,8,11,12], velocity: [0.9,0.5,0.85,0.9,0.5,0.85,0.9,0.5,0.85,0.9,0.5,0.85,0.9,0.5,0.85,0.9] },
                // Snare: Backbeat 2&4
                1: { on: [4,12] },
                // HiHat: Durchgehend 16tel, Off-Beats betont (Phonk-D-Shuffle)
                2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.5,0.3,0.8,0.35,0.5,0.3,0.8,0.35,0.5,0.3,0.8,0.35,0.5,0.3,0.8,0.35] },
                // Clap: Backbeat + Off-Beat-Verdopplungen (7,15) fuer Drive
                3: { on: [4,7,12,15], velocity: [,,,,0.8,,,0.45,,,,,,0.8,,,0.45] },
                // Perc: Conga-Pattern, synkopiert gegen Kick (polyrhythmisch)
                4: { on: [2,5,7,10,13,15], velocity: [,,0.6,,, 0.5,,0.7,,, 0.6,,, 0.5,,0.7] },
                // Bass: Synkopiert, beantwortet die Kick — Cm: C2-Eb2-G2-F2-C2-Bb1-G2-F2
                // Vermeidet bewusst Steps 0,4,8,12 wo die Kick sitzt (ausser 0,8 als Anker)
                5: { on: [0,3,6,8,11,14], notes: [36,39,43,36,46,41] },
                // Lead: Off-Beat Disco-Stabs, gefiltert gedacht — Eb5,G4,Eb5,C5
                6: { on: [2,6,10,14], notes: [75,67,75,72] },
            }
        },

        // 2. Filtered Disko — Nu-Disco/French-Touch-Einfluss a la fruehes Robsoul:
        //    Klassische Off-Beat HiHats (nur auf "und"), Disco-Oktav-Bass
        //    (Root-Oktave-Pump auf 8teln), Tambourine-Perc auf Beats,
        //    Stabs auf Off-Beats. Filter auf ~4kHz + Resonance 8 empfohlen.
        'phonk-filtered-disko': {
            bpm: 124,
            steps: {
                // Kick: Sauberes 4otf
                0: { on: [0,4,8,12] },
                // Snare: 2&4
                1: { on: [4,12] },
                // HiHat: Nur Off-Beats (Disco-Klassiker), akzentuiert
                2: { on: [2,6,10,14], velocity: [,,0.8,,,,0.7,,,,0.8,,,,0.7] },
                // Clap: Backbeat + Verdopplung 7,15 (Playdagroove-typisch)
                3: { on: [4,7,12,15], velocity: [,,,,0.8,,,0.5,,,,,,0.8,,,0.5] },
                // Perc: Tambourine/Shaker auf Beats (downbeat-Betonung)
                4: { on: [0,4,8,12], velocity: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5] },
                // Bass: Disco-Oktav-Pump auf 8teln — C2,C3,F2,C3,C2,C3,G2,C3
                5: { on: [0,2,4,6,8,10,12,14], notes: [36,48,41,48,36,48,43,48] },
                // Lead: Off-Beat Disco-Stabs Eb5-G5-Eb5-C5
                6: { on: [3,7,11,15], notes: [75,79,75,72] },
                // Pad: Harmonic Bed auf 1 und 3 (Cm-Tonalitaet)
                7: { on: [0,8], notes: [60,63] },
            }
        },

        // 3. Bumpin Percussion — Percussion-getrieben wie Phonk-D-Tracks auf Cajual/Guesthouse:
        //    Schwere Conga/Bongo-Polyrhythmik traegt den Track, Kick synkopiert,
        //    Bass minimal und deep, HiHats mit Velocity-Shuffle.
        //    Swing auf 25% empfohlen.
        'phonk-bumpin': {
            bpm: 125,
            steps: {
                // Kick: 4otf + Synkope auf 7 (vor Beat 3 = treibender Push)
                0: { on: [0,4,7,8,12], velocity: [0.9,0.9,0.55,0.9,0.9,0.9,0.9,0.55,0.9,0.9,0.9,0.9,0.55,0.9,0.9,0.9] },
                // Snare: 2&4
                1: { on: [4,12] },
                // HiHat: 8tel mit Shuffle-Velocity (Off-Beats lauter)
                2: { on: [0,2,4,6,8,10,12,14], velocity: [0.5,0.5,0.8,0.5,0.5,0.5,0.8,0.5,0.5,0.5,0.8,0.5,0.5,0.5,0.8,0.5] },
                // Clap: Nur auf 4 (minimal, Perc uebernimmt rhythmische Arbeit)
                3: { on: [4,12], velocity: [,,,,0.7,,,,,,,,0.6] },
                // Perc: HEAVY polyrhythmisch — Conga-Pattern 2,5,7,10,13,15
                // 6 Hits pro Bar, verschraenkt gegen Kick/HiHat
                4: { on: [2,5,7,10,13,15], velocity: [,,0.7,,,0.6,,0.8,,,0.7,,,0.6,,0.8] },
                // Bass: Minimal, deep, laesst Percussion atmen — C2,F2,C2,G2
                5: { on: [0,6,8,14], notes: [36,41,36,43] },
                // Lead: Zwei Stabs pro Bar, dialogisch
                6: { on: [6,14], notes: [75,72] },
                // Pad: Rhythmischer Chord-Pulse auf allen Beats
                7: { on: [0,4,8,12], notes: [60,63,60,63] },
            }
        },

        // 4. Funky Stabs — Chord-Stab-fokussiert wie fruehe Playdagroove-Releases:
        //    Off-Beat-Claps statt Backbeat (!) = Funk-DNA, dichtes HiHat-Pattern,
        //    Bass-Lick mit chromatischem Durchgang, Lead-Stabs als Hauptelement.
        'phonk-stabs': {
            bpm: 126,
            steps: {
                // Kick: 4otf clean
                0: { on: [0,4,8,12] },
                // Snare: 2&4 (unter den Claps, fuer Body)
                1: { on: [4,12], velocity: [,,,,0.6,,,,,,,,0.6] },
                // HiHat: 16tel mit starkem Ghost-Pattern
                2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.7,0.25,0.5,0.3,0.7,0.25,0.5,0.3,0.7,0.25,0.5,0.3,0.7,0.25,0.5,0.3] },
                // Clap: OFF-BEAT (3,7,11,15) statt Backbeat — das ist der Funk-Move
                3: { on: [3,7,11,15], velocity: [,,,0.7,,,,0.6,,,,0.7,,,,0.6] },
                // Perc: Sparse Synkope, laesst Raum fuer Stabs
                4: { on: [2,10] },
                // Bass: Funk-Lick mit chromatischem Durchgang Eb->E(natur)->F
                // C2, Eb2, E2, F2, C2, G2, F2, Eb2
                5: { on: [0,3,5,6,8,11,13,14], notes: [36,39,40,41,36,43,41,39] },
                // Lead: Dichte Off-Beat-Stabs = Hauptelement, Cm9-Voicing
                // Eb5, G4, Bb4, C5 — Disco-Chord-Stab aufgeloest
                6: { on: [2,6,10,14], notes: [75,67,70,72] },
            }
        },

        // 5. Deep Jackin — Deepere Variante seines Sounds (Salted/Guesthouse-Vibe):
        //    Weniger Elemente, aber jedes zaehlt. Warme Pads, zurueckgenommene Perc,
        //    trotzdem der Jackin-Push durch Ghost-Kick auf 11.
        //    Reverb 30%, Delay 15% auf 1/8 empfohlen.
        'phonk-deep-jackin': {
            bpm: 123,
            steps: {
                // Kick: 4otf + subtiler Ghost auf 11 (Jackin-Signatur auch im Deep-Kontext)
                0: { on: [0,4,8,11,12], velocity: [0.85,0.85,0.85,0.4,0.85,0.85,0.85,0.85,0.4,0.85,0.85,0.85,0.85,0.4,0.85,0.85] },
                // Snare: Nur auf 4, zurueckgenommen
                1: { on: [4,12], velocity: [,,,,0.5,,,,,,,,0.5] },
                // HiHat: Off-Beats, sanft (deepe Variante)
                2: { on: [2,6,10,14], velocity: [,,0.5,,,,0.45,,,,0.5,,,,0.45] },
                // Clap: Minimal — nur eine ghostige auf 4
                3: { on: [4], velocity: [,,,,0.4] },
                // Perc: Sehr sparse — zwei Akzente, Raum zum Atmen
                4: { on: [7,15], velocity: [,,,,,,,0.5,,,,,,,,0.5] },
                // Bass: Minimal deep, Raum lassend — C2, F2, C2, Bb1(46 ist eigentl. Bb2)
                // Bewusst wenige Noten, jede zaehlt
                5: { on: [0,6,8,14], notes: [36,41,36,46] },
                // Lead: Ein einziger Stab pro halben Takt, dialogisch
                6: { on: [3,11], notes: [75,72] },
                // Pad: Warme Chords, Cm-Voicings auf 1 und 3
                7: { on: [0,4,8,12], notes: [60,63,67,63] },
            }
        },

        // ========== STORKEN (Thomas Henriksson) STYLE PRESETS ==========
        // Nu Disco / Italo-Disco / Scandi Cosmic Disco — 123-127 BPM
        // Analog-Arpeggios, Dur-Tonalitaet, euphoric & life-affirming,
        // Walzer-Einfluss, bleepende Synths, 80er-Pop-DNA.
        // Running Back / Storkenland / Exploited Sound.

        // 1. Lille Vals — Sein Signature-Track: Walzer-Gefuehl im 4/4-Takt.
        //    Der "Vals"-Charakter entsteht durch 3er-Betonung in der Percussion
        //    (Steps 0,3,6,9,12,15 = 3-gegen-4 Polymetrik).
        //    Arpeggiierter Lead steigt auf und ab, warme Dur-Pads.
        //    Kick bewusst zurueckgenommen, Groove kommt aus Melodie + Perc.
        'storken-lille-vals': {
            bpm: 125,
            steps: {
                // Kick: 4otf, etwas leiser — Melodie fuehrt
                0: { on: [0,4,8,12], velocity: [0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7] },
                // Snare: Backbeat, sanft
                1: { on: [4,12], velocity: [,,,,0.5,,,,,,,,0.5] },
                // HiHat: Off-Beats Disco-typisch
                2: { on: [2,6,10,14], velocity: [,,0.6,,,,0.6,,,,0.6,,,,0.6] },
                // Clap: Leichter Backbeat
                3: { on: [4,12], velocity: [,,,,0.6,,,,,,,,0.6] },
                // Perc: WALZER-Polymetrik! Alle 3 Steps = 3-gegen-4 Feel
                // Steps 0,3,6,9,12,15 — das erzeugt den "Vals"-Charakter
                4: { on: [0,3,6,9,12,15], velocity: [0.6,0.45,0.5,0.45,0.6,0.45,0.6,0.45,0.5,0.45,0.6,0.45,0.6,0.45,0.5,0.45] },
                // Bass: Melodisch, Dur-Arpeggio aufwaerts C-E-G-C3
                5: { on: [0,4,8,12], notes: [36,40,43,48] },
                // Lead: Arpeggio auf-und-ab, analog bleepend
                // C5-E5-G5-E5-C5-E5-G5-E5 (Dur-Dreiklang sequenziert)
                6: { on: [0,2,4,6,8,10,12,14], notes: [72,76,79,76,72,76,79,76] },
                // Pad: Warme Dur-Flaeche C4-G4
                7: { on: [0,8], notes: [60,67] },
            }
        },

        // 2. Skogsdisko — "Walddisco": Organischer, naturverbundener Vibe.
        //    Bleepende Analog-Synths, Walking-Bass in Pentatonik,
        //    Shaker-artige HiHats, sparsame aber praezise Percussion.
        //    Heller Dur-Sound, aber mit erdiger Waerme.
        'storken-skogsdisko': {
            bpm: 124,
            steps: {
                // Kick: 4otf clean
                0: { on: [0,4,8,12] },
                // Snare: Sanfter Backbeat
                1: { on: [4,12], velocity: [,,,,0.55,,,,,,,,0.55] },
                // HiHat: 8tel Shaker-Feel, Off-Beats betont (organisch)
                2: { on: [0,2,4,6,8,10,12,14], velocity: [0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4] },
                // Clap: Nur auf 4 (minimal)
                3: { on: [4,12], velocity: [,,,,0.5,,,,,,,,0.45] },
                // Perc: Off-Beat Tambourine, leicht und luftig
                4: { on: [3,7,11,15], velocity: [,,,0.4,,,,0.35,,,,0.4,,,,0.35] },
                // Bass: Pentatonischer Walk — C-D-E-G-A-G (C-Dur Pentatonik, erdig)
                5: { on: [0,3,6,8,11,14], notes: [36,38,40,43,45,43] },
                // Lead: Bleepende Analog-Melodie, sparsam und melodisch
                6: { on: [2,6,10,14], notes: [72,79,76,72] },
                // Pad: Helle Dur-Flaeche C-E (Waldlichtung-Atmosphaere)
                7: { on: [0,8], notes: [60,64] },
            }
        },

        // 3. Italo Arpeggio — Inspiriert von seinem "Dr. Arpeggio" Remix (Bb-Dur, 127 BPM).
        //    Volle 16tel-Arpeggio-Sequenz im Lead = Italo-Disco-Herzschlag.
        //    Treibende 16tel-HiHats, Oktav-Pump-Bass, kein Pad (reine Energie).
        //    Der sequenzierte Synth IS die Melodie, Harmonie und der Drive.
        'storken-italo-arp': {
            bpm: 127,
            steps: {
                // Kick: 4otf, praesize
                0: { on: [0,4,8,12] },
                // Snare: Backbeat
                1: { on: [4,12] },
                // HiHat: Treibende 16tel, Italo-typisch, On-Beats staerker
                2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.7,0.3,0.5,0.3,0.7,0.3,0.5,0.3,0.7,0.3,0.5,0.3,0.7,0.3,0.5,0.3] },
                // Clap: Backbeat + leichte Off-Beat-Verdopplung
                3: { on: [4,12] },
                // Perc: Sparse, laesst dem Arpeggio Raum
                4: { on: [2,10], velocity: [,,0.4,,,,,,,,0.4] },
                // Bass: Bb-Dur Oktav-Pump (Bb2-Bb3, wie Dr. Arpeggio)
                5: { on: [0,2,4,6,8,10,12,14], notes: [46,58,46,58,46,58,46,58] },
                // Lead: VOLLES 16-STEP ARPEGGIO — Bb-Dur Dreiklang auf und ab
                // Bb4-D5-F5-Bb5-F5-D5-Bb4-D5-F5-Bb5-F5-D5-Bb4-D5-F5-Bb5
                6: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], notes: [70,74,77,82,77,74,70,74,77,82,77,74,70,74,77,82] },
            }
        },

        // 4. Scandi Cosmic — Kosmische Disco im Stil von Todd Terje / Prins Thomas,
        //    Storkens spacige Seite. Weite Intervalle im Bass (grosse Spruenge),
        //    lush Dur-Pads die sich bewegen, melodische Lead-Linie die schwebt.
        //    Langsamer, traeumerisch. Reverb 40%+ empfohlen.
        'storken-scandi-cosmic': {
            bpm: 123,
            steps: {
                // Kick: 4otf, zurueckgenommen fuer Space
                0: { on: [0,4,8,12], velocity: [0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7] },
                // Snare: Sehr sanft, fast nur Textur
                1: { on: [4,12], velocity: [,,,,0.4,,,,,,,,0.4] },
                // HiHat: Offene Off-Beats, spacig
                2: { on: [2,6,10,14], velocity: [,,0.5,,,,0.45,,,,0.5,,,,0.45] },
                // Clap: Off-Beat Akzente (nicht auf 2&4 — kosmisch verschoben)
                3: { on: [7,15], velocity: [,,,,,,,0.45,,,,,,,,0.45] },
                // Perc: Sparse kosmische Akzente
                4: { on: [3,11], velocity: [,,,0.4,,,,,,,,0.4] },
                // Bass: Weite melodische Spruenge — C2-G2-C3-A2 (Oktavsprung + Sexte)
                5: { on: [0,4,8,12], notes: [36,43,48,45] },
                // Lead: Schwebende Melodie, nicht arpeggiert sondern singend
                // C5-G5-F5-D5 (abwaerts, melancholisch-euphoric)
                6: { on: [2,5,10,13], notes: [72,79,77,74] },
                // Pad: Grosse Dur-Bewegung, Arpeggio-artig C-E-G-E
                7: { on: [0,4,8,12], notes: [60,64,67,64] },
            }
        },

        // 5. Stupidisco — Inspiriert von seinem Junior Jack Remix.
        //    Energetisch, bubbly, Pop-Disco-Energy. Alles ist hell und laut.
        //    Dichte Percussion (Shaker auf 8teln), bouncy Dur-Bass,
        //    strahlende Lead-Stabs. Pure Dancefloor-Euphorie.
        'storken-stupidisco': {
            bpm: 127,
            steps: {
                // Kick: 4otf, punchy
                0: { on: [0,4,8,12] },
                // Snare: Kraeftiger Backbeat
                1: { on: [4,12] },
                // HiHat: 16tel, energetisch, starker Downbeat-Akzent
                2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.8,0.35,0.55,0.35,0.8,0.35,0.55,0.35,0.8,0.35,0.55,0.35,0.8,0.35,0.55,0.35] },
                // Clap: Backbeat mit Verdopplung fuer Energy
                3: { on: [4,7,12,15], velocity: [,,,,0.8,,,0.5,,,,,,0.8,,,0.5] },
                // Perc: Shaker auf 8teln — pure Disco-Energy
                4: { on: [0,2,4,6,8,10,12,14], velocity: [0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45] },
                // Bass: Bouncy C-Dur, aufwaerts-Bewegung C-E-G-C-A-G
                5: { on: [0,3,6,8,10,12], notes: [36,40,43,48,45,43] },
                // Lead: Strahlende Off-Beat Disco-Stabs E5-G5-C5-E5
                6: { on: [2,6,10,14], notes: [76,79,72,76] },
                // Pad: Bright, C-F Dur-Bewegung
                7: { on: [0,8], notes: [60,65] },
            }
        },

        // ========== THOMAS HAMMANN STYLE PRESETS ==========
        // Robert Johnson Resident (Liquid Night), Workshop/808 Mate.
        // Reduziert, subtil, seduktiv. Shuffle-Drums, Acid-Bass,
        // synkopierte Piano-Chords, Boogie-Einfluss, Crate-Digger-Eklektik.
        // Swing auf 20-35% ist bei ALLEN Hammann-Presets essentiell.

        // 1. 808 Mate — Sein Produktions-Alias auf Workshop:
        //    "Reduced, shuffled drums, minimal chords, wriggling acid bass."
        //    Jedes Element ist auf das Noetigste reduziert. Der Shuffle
        //    in den HiHats traegt den ganzen Track. Bass windet sich
        //    chromatisch (Acid-303-Gefuehl). Chords nur angedeutet.
        //    Swing 30% PFLICHT. Filter ~6kHz empfohlen.
        'hammann-808mate': {
            bpm: 122,
            steps: {
                // Kick: 4otf, clean, reduziert — kein Ghost, kein Excess
                0: { on: [0,4,8,12] },
                // Snare: NUR auf 4 — extremes Weniger-ist-mehr
                1: { on: [4], velocity: [,,,,0.5] },
                // HiHat: Shuffle-Pattern — 8tel mit starker Velocity-Variation
                // Off-Beats leiser = der Shuffle kommt durch Swing-Setting
                2: { on: [0,2,4,6,8,10,12,14], velocity: [0.55,0.55,0.3,0.55,0.55,0.55,0.3,0.55,0.55,0.55,0.3,0.55,0.55,0.55,0.3,0.55] },
                // Clap: Ghostig auf 12 (kaum hoerbar, nur Textur)
                3: { on: [12], velocity: [,,,,,,,,,,,,0.3] },
                // Perc: KEINE — Workshop-Reduktion
                // Bass: Acid-Wriggle, chromatisch windend
                // C2, D2, Eb2, D2, C2, Bb1, C2, Eb2 — 303-typische Chromatik
                5: { on: [0,2,4,6,8,10,12,14], notes: [36,38,39,38,36,34,36,39] },
                // Lead: Minimale Chord-Andeutung, nur 2 Stabs pro Bar
                6: { on: [3,11], notes: [63,60] },
                // Pad: KEIN Pad — Reduktion
            }
        },

        // 2. Liquid Night — Der Sound der Robert-Johnson-Nacht:
        //    "Silken house pulsations", subtil, seduktiv, zieht den
        //    Hoerer langsam rein statt zu ueberwaeltigen.
        //    Synkopierte House-Piano-Chords als Kernelement,
        //    deep pulsierender Bass, warme Pads. Alles atmet.
        //    Swing 25%, Reverb 25% empfohlen.
        'hammann-liquid': {
            bpm: 120,
            steps: {
                // Kick: 4otf, warm, nicht aggressiv
                0: { on: [0,4,8,12], velocity: [0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75] },
                // Snare: Backbeat, sanft
                1: { on: [4,12], velocity: [,,,,0.45,,,,,,,,0.45] },
                // HiHat: Off-Beats, silky
                2: { on: [2,6,10,14], velocity: [,,0.45,,,,0.45,,,,0.45,,,,0.45] },
                // Clap: Leicht auf 4, Textur
                3: { on: [4,12], velocity: [,,,,0.4,,,,,,,,0.35] },
                // Perc: Ein einzelner Akzent, Raum zum Atmen
                4: { on: [7], velocity: [,,,,,,,0.35] },
                // Bass: Deep, pulsierend, wenige Noten — Am (seduktiv Moll)
                // A1, E2, A1, G2 — tief, minimal, jede Note zaehlt
                5: { on: [0,6,8,14], notes: [33,40,33,43] },
                // Lead: SYNKOPIERTE Piano-Chords — das Herzstuck
                // Off-Beat Chords auf 3,6,11,14 — nie auf dem Beat
                6: { on: [3,6,11,14], notes: [69,72,69,67] },
                // Pad: Warme Flaeche, Am-Tonalitaet, atmet
                7: { on: [0,8], notes: [57,60] },
            }
        },

        // 3. Wah-Wah Boogie — Seine Disco/Boogie-Seite:
        //    Wah-Wah-Gitarren-Feeling im Lead (rhythmische Off-Beat-Stabs
        //    mit Velocity-Variation = Wah-Effekt), Boogie-Walking-Bass,
        //    Conga-Percussion. Die 1993-2008 Retrospektive-Aera.
        //    Swing 20%, Filter auf 8kHz + Resonance 5 fuer Wah-Feel.
        'hammann-wahwah': {
            bpm: 118,
            steps: {
                // Kick: 4otf
                0: { on: [0,4,8,12] },
                // Snare: Backbeat
                1: { on: [4,12], velocity: [,,,,0.55,,,,,,,,0.55] },
                // HiHat: Disco 8tel, Off-Beats betont
                2: { on: [0,2,4,6,8,10,12,14], velocity: [0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4] },
                // Clap: Off-Beat fuer Funk (3,11)
                3: { on: [3,11], velocity: [,,,0.5,,,,,,,,0.5] },
                // Perc: Conga-Pattern, Boogie-typisch
                4: { on: [2,5,10,13], velocity: [,,0.5,,,0.4,,,,, 0.5,,,0.4] },
                // Bass: Boogie-Walk in Am — A1,C2,D2,E2,C2,A1
                5: { on: [0,3,6,8,11,14], notes: [33,36,38,40,36,33] },
                // Lead: WAH-WAH-Stabs — schnelle Off-Beat-Hits mit Velocity-Variation
                // = simuliert Wah-Wah-Gitarre (offen/geschlossen)
                6: { on: [1,3,5,7,9,11,13,15], notes: [69,69,72,69,69,69,72,69] },
                // Pad: Kein Pad (Boogie braucht Luft)
            }
        },

        // 4. Frankfurt Deep — Chez-Damier/Larry-Heard-Einfluss,
        //    klassischer deutscher Deep House. Ultra-warm, ultra-reduziert.
        //    Bass und Pad tragen den Track, Drums sind nur Skelett.
        //    Weniger Elemente als je zuvor — purer Vibe.
        //    Reverb 35%, kein Delay empfohlen.
        'hammann-ffm-deep': {
            bpm: 119,
            steps: {
                // Kick: 4otf, sanft
                0: { on: [0,4,8,12], velocity: [0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65] },
                // Snare: NUR auf Beat 4, ghostig
                1: { on: [12], velocity: [,,,,,,,,,,,,0.35] },
                // HiHat: Sparse Off-Beats, kaum da
                2: { on: [6,14], velocity: [,,,,,,0.35,,,,,,,,0.35] },
                // Clap: KEINE
                // Perc: KEINE — puristisch
                // Bass: Deep, warm, Dm — wenig Bewegung, Raum
                // D2, F2, D2, A2 — Dm-Dreiklang, langsam
                5: { on: [0,4,8,12], notes: [38,41,38,45] },
                // Lead: KEINE — nur Bass und Pad
                // Pad: LUSH, warm, Dm-Voicing, traegt den ganzen Track
                // D4, F4, A4, F4
                7: { on: [0,4,8,12], notes: [62,65,69,65] },
            }
        },

        // 5. Record Digger — Der eklektische Crate-Digger-Mix:
        //    Chicago-House trifft Jazz-Funk (Azymuth-Einfluss aus seinem
        //    Live-at-RJ Mix). Swing-heavy, synkopiert, unvorhersehbar.
        //    Jedes Element kommt aus einer anderen Aera.
        //    Swing 35% PFLICHT.
        'hammann-digger': {
            bpm: 124,
            steps: {
                // Kick: Chicago-Pattern, synkopiert mit Ghost
                0: { on: [0,3,4,8,12], velocity: [0.8,0.5,0.8,0.8,0.8,0.8,0.8,0.8,0.5,0.8,0.8,0.8,0.8,0.8,0.8,0.8] },
                // Snare: Backbeat
                1: { on: [4,12] },
                // HiHat: 16tel, Chicago-Shuffle, starke Dynamik
                2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.6,0.25,0.45,0.25,0.6,0.25,0.45,0.25,0.6,0.25,0.45,0.25,0.6,0.25,0.45,0.25] },
                // Clap: Nur auf 4 (trocken, Chicago)
                3: { on: [4], velocity: [,,,,0.7] },
                // Perc: Jazz-Ride-Feeling, Triolen-Andeutung (3,7,11)
                4: { on: [3,7,11], velocity: [,,,0.4,,,,0.35,,,,0.4] },
                // Bass: Funky, Jazz-beeinflusst — Fm7 Voicing
                // F2, Ab2, C2, Eb2, F2, Ab2 — jazzy Chromatik
                5: { on: [0,3,6,8,11,14], notes: [41,44,36,39,41,44] },
                // Lead: Off-Beat Jazz-Stabs, Fm Tonalitaet
                6: { on: [2,6,10,14], notes: [68,72,65,68] },
                // Pad: Jazzy Fm7-Atmosphaere
                7: { on: [0,8], notes: [60,63] },
            }
        }
    };

    // ---- Main App ----
    class FunkyBeatsApp {
        constructor() {
            this.audio = new AudioEngine();
            this.seq = new SequencerState();
            this.playing = false;
            this.recording = false;
            this.currentStep = -1;
            this.bpm = 128;
            this.swing = 0;
            this.nextStepTime = 0;
            this.scheduleAheadTime = 0.1;
            this.lookAhead = 25;
            this.timerID = null;
            this.pianoRollChannel = 5;
            this.pianoRollOctave = 3;
            this.vuLevels = new Array(CHANNELS.length + 1).fill(0);
            this.activeTab = 'sequencer';

            this.init();
        }

        async init() {
            this.buildSequencerUI();
            this.buildMixerUI();
            this.buildPianoRollKeys();
            this.buildStepIndicators();
            this.bindEvents();
            this.drawPianoRoll();
            this.startVisualizer();
            this.updateStatus('Click Play or press Space to start');
        }

        // ---- UI Building (safe DOM methods) ----
        buildSequencerUI() {
            const grid = document.querySelector('.sequencer-grid');
            grid.textContent = '';

            CHANNELS.forEach((ch, chIdx) => {
                const row = el('div', { className: 'seq-row', 'data-channel': chIdx });

                // Channel info
                const info = el('div', { className: 'seq-channel-info' }, [
                    el('div', { className: 'seq-channel-color', style: { background: ch.color } }),
                    el('span', { className: 'seq-channel-name', style: { color: ch.color }, text: ch.name }),
                    el('div', { className: 'seq-channel-btns' }, [
                        el('button', { className: 'seq-mute', 'data-ch': String(chIdx), title: 'Mute', text: 'M' }),
                        el('button', { className: 'seq-solo', 'data-ch': String(chIdx), title: 'Solo', text: 'S' }),
                    ]),
                ]);
                row.appendChild(info);

                // Steps
                const stepsContainer = el('div', { className: 'seq-steps' });
                for (let g = 0; g < 4; g++) {
                    const group = el('div', { className: 'seq-step-group' });
                    for (let s = 0; s < 4; s++) {
                        const stepIdx = g * 4 + s;
                        const step = el('div', { className: 'seq-step', 'data-channel': String(chIdx), 'data-step': String(stepIdx) }, [
                            el('div', { className: 'step-fill' }),
                            el('div', { className: 'velocity-bar' }),
                        ]);
                        group.appendChild(step);
                    }
                    stepsContainer.appendChild(group);
                }
                row.appendChild(stepsContainer);
                grid.appendChild(row);
            });
        }

        buildMixerUI() {
            const container = document.getElementById('mixer-channels');
            container.textContent = '';

            CHANNELS.forEach((ch, idx) => {
                container.appendChild(this.createMixerStrip(ch.name, ch.color, idx, false));
            });
            container.appendChild(this.createMixerStrip('MASTER', '#ff6b35', -1, true));
        }

        createMixerStrip(name, color, idx, isMaster) {
            const idStr = isMaster ? 'master' : String(idx);
            const strip = el('div', { className: 'mixer-channel' + (isMaster ? ' master' : '') });

            strip.appendChild(el('span', { className: 'mixer-channel-name', text: name }));
            strip.appendChild(el('div', { className: 'mixer-color-dot', style: { background: color } }));

            // VU meter
            const vu = el('div', { className: 'mixer-vu' });
            const vuFill = el('div', { className: 'mixer-vu-fill', style: { height: '0%' } });
            vuFill.dataset.vu = idStr;
            vu.appendChild(vuFill);
            strip.appendChild(vu);

            // Fader
            const faderContainer = el('div', { className: 'mixer-fader-container' });
            const fader = el('input', {
                type: 'range', className: 'mixer-fader',
                min: '0', max: '100', value: isMaster ? '80' : '70',
            });
            fader.dataset.fader = idStr;
            faderContainer.appendChild(fader);
            strip.appendChild(faderContainer);

            // dB display
            const db = el('span', { className: 'mixer-db', text: '-3.0dB' });
            db.dataset.db = idStr;
            strip.appendChild(db);

            // Pan
            const panContainer = el('div', { className: 'mixer-pan-container' });
            panContainer.appendChild(el('label', { text: 'L' }));
            const panSlider = el('input', {
                type: 'range', className: 'mixer-pan',
                min: '-100', max: '100', value: '0',
            });
            panSlider.dataset.pan = idStr;
            if (isMaster) panSlider.disabled = true;
            panContainer.appendChild(panSlider);
            panContainer.appendChild(el('label', { text: 'R' }));
            strip.appendChild(panContainer);

            // Mute/Solo
            if (!isMaster) {
                const btns = el('div', { className: 'mixer-btns' });
                const muteBtn = el('button', { className: 'mixer-mute', text: 'M' });
                muteBtn.dataset.mute = String(idx);
                const soloBtn = el('button', { className: 'mixer-solo', text: 'S' });
                soloBtn.dataset.solo = String(idx);
                btns.appendChild(muteBtn);
                btns.appendChild(soloBtn);
                strip.appendChild(btns);
            }

            return strip;
        }

        buildPianoRollKeys() {
            const container = document.getElementById('piano-keys');
            container.textContent = '';

            const startNote = (this.pianoRollOctave + 2) * 12 - 1;
            for (let i = 0; i < 24; i++) {
                const noteNum = startNote - i;
                const noteName = NOTE_NAMES[noteNum % 12];
                const octave = Math.floor(noteNum / 12) - 1;
                const isBlack = BLACK_KEYS.includes(noteNum % 12);
                const isC = noteNum % 12 === 0;

                const key = el('div', {
                    className: 'piano-key ' + (isBlack ? 'black' : 'white') + (isC ? ' c-note' : ''),
                    text: noteName + octave,
                });
                key.dataset.note = String(noteNum);
                container.appendChild(key);
            }
        }

        buildStepIndicators() {
            const container = document.getElementById('step-indicators');
            container.textContent = '';
            for (let i = 0; i < STEPS; i++) {
                const ind = el('div', { className: 'step-indicator' });
                ind.dataset.step = String(i);
                container.appendChild(ind);
            }
        }

        // ---- Event Binding ----
        bindEvents() {
            document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
            document.getElementById('btn-stop').addEventListener('click', () => this.stop());
            document.getElementById('btn-record').addEventListener('click', () => this.toggleRecord());

            document.getElementById('bpm').addEventListener('change', (e) => {
                this.bpm = Math.max(60, Math.min(200, parseInt(e.target.value) || 128));
                e.target.value = this.bpm;
                if (this.audio.initialized) {
                    const delayTime = parseInt(document.getElementById('fx-delay-time').value);
                    this.audio.setDelayTime(delayTime, this.bpm);
                }
            });

            document.getElementById('swing').addEventListener('input', (e) => {
                this.swing = parseInt(e.target.value);
                document.getElementById('swing-val').textContent = this.swing + '%';
            });

            document.querySelectorAll('.pattern-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    this.seq.currentPattern = parseInt(e.target.dataset.pattern);
                    this.refreshSequencerUI();
                    this.drawPianoRoll();
                });
            });

            document.getElementById('preset-select').addEventListener('change', (e) => {
                if (e.target.value) this.loadPreset(e.target.value);
            });

            document.getElementById('btn-export').addEventListener('click', () => this.exportWAV());

            // Tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const target = e.target.dataset.tab;
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                    e.target.classList.add('active');
                    document.getElementById('panel-' + target).classList.add('active');
                    this.activeTab = target;
                    if (target === 'pianoroll') {
                        requestAnimationFrame(() => this.resizePianoRollCanvas());
                    }
                });
            });

            // Step sequencer clicks
            document.querySelector('.sequencer-grid').addEventListener('mousedown', (e) => {
                const step = e.target.closest('.seq-step');
                if (!step) return;
                this.ensureAudio();
                const ch = parseInt(step.dataset.channel);
                const s = parseInt(step.dataset.step);

                if (e.button === 2) {
                    e.preventDefault();
                    if (this.seq.pattern[ch][s].on) {
                        const vels = [0.4, 0.6, 0.8, 1.0];
                        const curIdx = vels.indexOf(this.seq.pattern[ch][s].velocity);
                        this.seq.pattern[ch][s].velocity = vels[(curIdx + 1) % vels.length];
                        this.refreshStep(ch, s);
                    }
                } else {
                    this.seq.toggle(ch, s);
                    this.refreshStep(ch, s);
                    if (this.seq.pattern[ch][s].on && !this.playing) {
                        const data = this.seq.pattern[ch][s];
                        this.audio.playSynth(CHANNELS[ch].synth, this.audio.ctx.currentTime, data.velocity, data.note, ch);
                    }
                }
            });

            document.querySelector('.sequencer-grid').addEventListener('contextmenu', e => {
                if (e.target.closest('.seq-step')) e.preventDefault();
            });

            // Mute/Solo in sequencer
            document.querySelector('.sequencer-grid').addEventListener('click', (e) => {
                const muteBtn = e.target.closest('.seq-mute');
                const soloBtn = e.target.closest('.seq-solo');
                if (muteBtn) {
                    const ch = parseInt(muteBtn.dataset.ch);
                    this.audio.channelMuted[ch] = !this.audio.channelMuted[ch];
                    muteBtn.classList.toggle('active');
                    const mixerMute = document.querySelector('[data-mute="' + ch + '"]');
                    if (mixerMute) mixerMute.classList.toggle('active', this.audio.channelMuted[ch]);
                }
                if (soloBtn) {
                    const ch = parseInt(soloBtn.dataset.ch);
                    this.audio.channelSolo[ch] = !this.audio.channelSolo[ch];
                    soloBtn.classList.toggle('active');
                    const mixerSolo = document.querySelector('[data-solo="' + ch + '"]');
                    if (mixerSolo) mixerSolo.classList.toggle('active', this.audio.channelSolo[ch]);
                }
            });

            // Mixer faders
            document.getElementById('mixer-channels').addEventListener('input', (e) => {
                this.ensureAudio();
                const fader = e.target.closest('.mixer-fader');
                if (fader) {
                    const val = parseInt(fader.value) / 100;
                    const id = fader.dataset.fader;
                    if (id === 'master') {
                        this.audio.setMasterVolume(val);
                    } else {
                        this.audio.setChannelVolume(parseInt(id), val);
                    }
                    const db = val > 0 ? (20 * Math.log10(val)).toFixed(1) : '-inf';
                    const dbEl = document.querySelector('[data-db="' + id + '"]');
                    if (dbEl) dbEl.textContent = db + 'dB';
                }

                const pan = e.target.closest('.mixer-pan');
                if (pan && pan.dataset.pan !== 'master') {
                    const val = parseInt(pan.value) / 100;
                    this.audio.setChannelPan(parseInt(pan.dataset.pan), val);
                }
            });

            // Mixer mute/solo
            document.getElementById('mixer-channels').addEventListener('click', (e) => {
                const muteBtn = e.target.closest('.mixer-mute');
                const soloBtn = e.target.closest('.mixer-solo');
                if (muteBtn) {
                    const ch = parseInt(muteBtn.dataset.mute);
                    this.audio.channelMuted[ch] = !this.audio.channelMuted[ch];
                    muteBtn.classList.toggle('active');
                    const seqMute = document.querySelector('.seq-mute[data-ch="' + ch + '"]');
                    if (seqMute) seqMute.classList.toggle('active', this.audio.channelMuted[ch]);
                }
                if (soloBtn) {
                    const ch = parseInt(soloBtn.dataset.solo);
                    this.audio.channelSolo[ch] = !this.audio.channelSolo[ch];
                    soloBtn.classList.toggle('active');
                    const seqSolo = document.querySelector('.seq-solo[data-ch="' + ch + '"]');
                    if (seqSolo) seqSolo.classList.toggle('active', this.audio.channelSolo[ch]);
                }
            });

            // Effects
            this.bindEffect('fx-reverb', (v) => this.audio.setReverb(v / 100), (v) => v + '%');
            this.bindEffect('fx-delay', (v) => this.audio.setDelay(v / 100), (v) => v + '%');
            this.bindEffect('fx-delay-time', (v) => {
                this.audio.setDelayTime(v, this.bpm);
            }, (v) => {
                const labels = {1:'1/16',2:'1/8',3:'3/16',4:'1/4',5:'5/16',6:'3/8',7:'7/16',8:'1/2',9:'9/16',10:'5/8',11:'11/16',12:'3/4',13:'13/16',14:'7/8',15:'15/16',16:'1/1'};
                return labels[v] || v;
            });
            this.bindEffect('fx-filter', (v) => this.audio.setFilter(v), (v) => v >= 1000 ? (v/1000).toFixed(1)+'kHz' : v+'Hz');
            this.bindEffect('fx-resonance', (v) => this.audio.setResonance(parseFloat(v)), (v) => v);
            this.bindEffect('fx-distortion', (v) => this.audio.setDistortion(v / 100), (v) => v + '%');
            this.bindEffect('fx-compressor', (v) => this.audio.setCompressor(v / 100), (v) => v + '%');
            this.bindEffect('fx-master', (v) => this.audio.setMasterVolume(v / 100), (v) => v + '%');

            // Piano roll
            document.getElementById('pianoroll-channel').addEventListener('change', (e) => {
                this.pianoRollChannel = parseInt(e.target.value);
                this.drawPianoRoll();
            });
            document.getElementById('octave-down').addEventListener('click', () => {
                if (this.pianoRollOctave > 1) {
                    this.pianoRollOctave--;
                    document.getElementById('octave-display').textContent = this.pianoRollOctave;
                    this.buildPianoRollKeys();
                    this.drawPianoRoll();
                }
            });
            document.getElementById('octave-up').addEventListener('click', () => {
                if (this.pianoRollOctave < 6) {
                    this.pianoRollOctave++;
                    document.getElementById('octave-display').textContent = this.pianoRollOctave;
                    this.buildPianoRollKeys();
                    this.drawPianoRoll();
                }
            });
            document.getElementById('clear-notes').addEventListener('click', () => {
                this.seq.clear(this.pianoRollChannel);
                this.refreshSequencerUI();
                this.drawPianoRoll();
            });

            document.getElementById('pianoroll-canvas').addEventListener('mousedown', (e) => this.handlePianoRollClick(e));

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                switch (e.code) {
                    case 'Space':
                        e.preventDefault();
                        this.togglePlay();
                        break;
                    case 'Escape':
                        this.stop();
                        break;
                }
            });

            window.addEventListener('resize', () => {
                this.resizePianoRollCanvas();
                this.resizeVisualizer();
            });

            this.resizeVisualizer();
        }

        bindEffect(id, setter, formatter) {
            document.getElementById(id).addEventListener('input', (e) => {
                this.ensureAudio();
                const v = parseFloat(e.target.value);
                setter(v);
                document.getElementById(id + '-val').textContent = formatter(v);
            });
        }

        // ---- Audio Init Guard ----
        async ensureAudio() {
            if (!this.audio.initialized) {
                await this.audio.init();
            }
            if (this.audio.ctx.state === 'suspended') {
                await this.audio.ctx.resume();
            }
        }

        // ---- Transport ----
        async togglePlay() {
            await this.ensureAudio();
            if (this.playing) {
                this.pause();
            } else {
                this.play();
            }
        }

        play() {
            this.playing = true;
            this.currentStep = -1;
            this.nextStepTime = this.audio.ctx.currentTime + 0.05;
            document.getElementById('btn-play').classList.add('active');
            this.scheduler();
            this.updateStatus('Playing - Pattern ' + (this.seq.currentPattern + 1));
        }

        pause() {
            this.playing = false;
            clearTimeout(this.timerID);
            document.getElementById('btn-play').classList.remove('active');
            this.updateStatus('Paused');
        }

        stop() {
            this.playing = false;
            this.currentStep = -1;
            clearTimeout(this.timerID);
            document.getElementById('btn-play').classList.remove('active');
            document.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing'));
            document.querySelectorAll('.step-indicator.active, .step-indicator.beat').forEach(el => {
                el.classList.remove('active', 'beat');
            });
            this.updateStatus('Stopped');
        }

        toggleRecord() {
            this.recording = !this.recording;
            document.getElementById('btn-record').classList.toggle('active', this.recording);
        }

        scheduler() {
            if (!this.playing) return;

            while (this.nextStepTime < this.audio.ctx.currentTime + this.scheduleAheadTime) {
                this.currentStep = (this.currentStep + 1) % STEPS;
                this.scheduleStep(this.currentStep, this.nextStepTime);
                this.advanceTime();
            }

            this.timerID = setTimeout(() => this.scheduler(), this.lookAhead);
        }

        advanceTime() {
            const secondsPerBeat = 60.0 / this.bpm;
            const secondsPer16th = secondsPerBeat / 4;

            let swingOffset = 0;
            if (this.currentStep % 2 === 1 && this.swing > 0) {
                swingOffset = secondsPer16th * (this.swing / 100) * 0.5;
            }

            this.nextStepTime += secondsPer16th + swingOffset;
        }

        scheduleStep(step, time) {
            const pattern = this.seq.pattern;

            for (let ch = 0; ch < CHANNELS.length; ch++) {
                const data = pattern[ch][step];
                if (data.on) {
                    this.audio.playSynth(CHANNELS[ch].synth, time, data.velocity, data.note, ch);
                    this.vuLevels[ch] = data.velocity;
                }
            }

            const delay = Math.max(0, (time - this.audio.ctx.currentTime) * 1000);
            setTimeout(() => this.updatePlayhead(step), delay);
        }

        updatePlayhead(step) {
            document.querySelectorAll('.step-indicator').forEach(ind => {
                ind.classList.remove('active', 'beat');
            });
            const indicator = document.querySelector('.step-indicator[data-step="' + step + '"]');
            if (indicator) {
                indicator.classList.add(step % 4 === 0 ? 'beat' : 'active');
            }

            document.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing'));
            document.querySelectorAll('.seq-step[data-step="' + step + '"]').forEach(el => {
                el.classList.add('playing');
            });

            if (this.activeTab === 'pianoroll') {
                this.drawPianoRoll(step);
            }

            const beat = Math.floor(step / 4) + 1;
            const sub = (step % 4) + 1;
            document.getElementById('status-center').textContent = beat + '.' + sub + ' / 4.4';
        }

        // ---- Sequencer UI Refresh ----
        refreshSequencerUI() {
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                for (let s = 0; s < STEPS; s++) {
                    this.refreshStep(ch, s);
                }
            }
        }

        refreshStep(ch, s) {
            const elem = document.querySelector('.seq-step[data-channel="' + ch + '"][data-step="' + s + '"]');
            if (!elem) return;
            const data = this.seq.pattern[ch][s];
            const fill = elem.querySelector('.step-fill');
            const velBar = elem.querySelector('.velocity-bar');

            if (data.on) {
                elem.classList.add('on');
                fill.style.background = CHANNELS[ch].color;
                velBar.style.height = ((1 - data.velocity) * 50) + '%';

                if (CHANNELS[ch].type === 'synth') {
                    elem.classList.add('synth-note');
                    const noteName = NOTE_NAMES[data.note % 12];
                    const octave = Math.floor(data.note / 12) - 1;
                    let label = elem.querySelector('.note-label');
                    if (!label) {
                        label = el('span', {
                            className: 'note-label',
                            style: {
                                position: 'absolute', top: '1px', left: '2px',
                                fontSize: '7px', color: 'rgba(255,255,255,0.8)',
                                zIndex: '1', pointerEvents: 'none',
                            }
                        });
                        elem.appendChild(label);
                    }
                    label.textContent = noteName + octave;
                } else {
                    elem.classList.remove('synth-note');
                    const label = elem.querySelector('.note-label');
                    if (label) label.remove();
                }
            } else {
                elem.classList.remove('on', 'synth-note');
                fill.style.background = 'transparent';
                velBar.style.height = '0';
                const label = elem.querySelector('.note-label');
                if (label) label.remove();
            }
        }

        // ---- Piano Roll ----
        resizePianoRollCanvas() {
            const canvas = document.getElementById('pianoroll-canvas');
            const container = canvas.parentElement;
            if (container) {
                canvas.width = container.clientWidth - 48;
                canvas.height = 480;
                this.drawPianoRoll();
            }
        }

        drawPianoRoll(playheadStep) {
            const canvas = document.getElementById('pianoroll-canvas');
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const noteCount = 24;
            const noteH = h / noteCount;
            const stepW = w / STEPS;
            const startNote = (this.pianoRollOctave + 2) * 12 - 1;
            const ch = this.pianoRollChannel;
            const color = CHANNELS[ch].color;

            ctx.fillStyle = '#12121e';
            ctx.fillRect(0, 0, w, h);

            // Grid
            for (let i = 0; i <= noteCount; i++) {
                const noteNum = startNote - i;
                const isBlack = BLACK_KEYS.includes(((noteNum % 12) + 12) % 12);
                const y = i * noteH;

                ctx.fillStyle = isBlack ? '#0e0e1a' : '#16162a';
                ctx.fillRect(0, y, w, noteH);

                if (((noteNum % 12) + 12) % 12 === 0) {
                    ctx.fillStyle = 'rgba(255, 107, 53, 0.05)';
                    ctx.fillRect(0, y, w, noteH);
                }

                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            for (let s = 0; s <= STEPS; s++) {
                const x = s * stepW;
                ctx.strokeStyle = s % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
                ctx.lineWidth = s % 4 === 0 ? 1.5 : 0.5;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
                ctx.lineWidth = 1;
            }

            // Notes
            const pattern = this.seq.pattern[ch];
            for (let s = 0; s < STEPS; s++) {
                if (pattern[s].on) {
                    const noteIdx = startNote - pattern[s].note;
                    if (noteIdx >= 0 && noteIdx < noteCount) {
                        const x = s * stepW + 1;
                        const y = noteIdx * noteH + 1;
                        const opacity = 0.5 + pattern[s].velocity * 0.5;

                        ctx.fillStyle = color;
                        ctx.globalAlpha = opacity;
                        ctx.fillRect(x, y, stepW - 2, noteH - 2);

                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x, y, stepW - 2, noteH - 2);
                        ctx.globalAlpha = 1;

                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        ctx.fillRect(x, y + noteH - 4, (stepW - 2) * pattern[s].velocity, 2);
                    }
                }
            }

            // Playhead
            if (playheadStep !== undefined && playheadStep >= 0) {
                const x = playheadStep * stepW;
                ctx.fillStyle = 'rgba(0, 255, 135, 0.15)';
                ctx.fillRect(x, 0, stepW, h);
                ctx.strokeStyle = '#00ff87';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
                ctx.lineWidth = 1;
            }
        }

        handlePianoRollClick(e) {
            this.ensureAudio();
            const canvas = document.getElementById('pianoroll-canvas');
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const noteCount = 24;
            const noteH = canvas.height / noteCount;
            const stepW = canvas.width / STEPS;
            const startNote = (this.pianoRollOctave + 2) * 12 - 1;

            const step = Math.floor(x / stepW);
            const noteIdx = Math.floor(y / noteH);
            const note = startNote - noteIdx;

            if (step < 0 || step >= STEPS || noteIdx < 0 || noteIdx >= noteCount) return;

            const ch = this.pianoRollChannel;
            const pattern = this.seq.pattern[ch];

            if (pattern[step].on && pattern[step].note === note) {
                pattern[step].on = false;
            } else {
                pattern[step].on = true;
                pattern[step].note = note;
                pattern[step].velocity = 0.8;
                if (!this.playing) {
                    this.audio.playSynth(CHANNELS[ch].synth, this.audio.ctx.currentTime, 0.8, note, ch);
                }
            }

            this.refreshStep(ch, step);
            this.drawPianoRoll();
        }

        // ---- Visualizer ----
        resizeVisualizer() {
            const canvas = document.getElementById('visualizer');
            canvas.width = canvas.parentElement.clientWidth;
        }

        startVisualizer() {
            const canvas = document.getElementById('visualizer');
            const ctx = canvas.getContext('2d');
            const draw = () => {
                requestAnimationFrame(draw);
                const w = canvas.width;
                const h = canvas.height;
                ctx.fillStyle = 'rgba(10, 10, 20, 0.3)';
                ctx.fillRect(0, 0, w, h);

                if (this.audio.analyser) {
                    const bufferLength = this.audio.analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);
                    this.audio.analyser.getByteFrequencyData(dataArray);

                    const barCount = 64;
                    const barWidth = w / barCount;
                    const step = Math.floor(bufferLength / barCount);

                    for (let i = 0; i < barCount; i++) {
                        const val = dataArray[i * step] / 255;
                        const barH = val * h * 0.9;

                        const hue = 15 + (i / barCount) * 30;
                        const lightness = 40 + val * 30;
                        ctx.fillStyle = 'hsl(' + hue + ', 100%, ' + lightness + '%)';
                        ctx.fillRect(i * barWidth + 1, h - barH, barWidth - 2, barH);

                        if (val > 0.7) {
                            ctx.fillStyle = 'hsla(' + hue + ', 100%, 60%, 0.3)';
                            ctx.fillRect(i * barWidth, h - barH - 4, barWidth, 4);
                        }
                    }
                }

                // VU meter decay
                for (let i = 0; i < this.vuLevels.length; i++) {
                    this.vuLevels[i] *= 0.92;
                    const vuFill = document.querySelector('[data-vu="' + (i === CHANNELS.length ? 'master' : i) + '"]');
                    if (vuFill) {
                        vuFill.style.height = (this.vuLevels[i] * 100) + '%';
                    }
                }

                // Master VU
                if (this.audio.analyser) {
                    const data = new Uint8Array(this.audio.analyser.frequencyBinCount);
                    this.audio.analyser.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const val = (data[i] - 128) / 128;
                        sum += val * val;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    this.vuLevels[CHANNELS.length] = Math.max(this.vuLevels[CHANNELS.length], rms * 3);
                }
            };
            draw();
        }

        // ---- Presets ----
        loadPreset(name) {
            const preset = PRESETS[name];
            if (!preset) return;

            this.seq.clearAll();
            this.bpm = preset.bpm;
            document.getElementById('bpm').value = preset.bpm;

            for (const [chStr, data] of Object.entries(preset.steps)) {
                const ch = parseInt(chStr);
                if (data.on) {
                    data.on.forEach((step, idx) => {
                        this.seq.pattern[ch][step].on = true;
                        if (data.velocity && data.velocity[step] !== undefined) {
                            this.seq.pattern[ch][step].velocity = data.velocity[step];
                        }
                        if (data.notes && data.notes[idx] !== undefined) {
                            this.seq.pattern[ch][step].note = data.notes[idx];
                        }
                    });
                }
            }

            this.refreshSequencerUI();
            this.drawPianoRoll();
            this.updateStatus('Loaded preset: ' + name);
        }

        // ---- Export WAV ----
        async exportWAV() {
            await this.ensureAudio();
            this.updateStatus('Exporting WAV... Rendering 4 bars...');

            const sampleRate = 44100;
            const barsToRender = 4;
            const secondsPerStep = 60 / this.bpm / 4;
            const totalSteps = STEPS * barsToRender;
            const duration = totalSteps * secondsPerStep + 1;

            const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);

            const masterGain = offlineCtx.createGain();
            masterGain.gain.value = 0.8;
            masterGain.connect(offlineCtx.destination);

            const compressor = offlineCtx.createDynamicsCompressor();
            compressor.connect(masterGain);

            const noiseBuffer = offlineCtx.createBuffer(1, sampleRate * 2, sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

            for (let barRepeat = 0; barRepeat < barsToRender; barRepeat++) {
                for (let step = 0; step < STEPS; step++) {
                    let time = (barRepeat * STEPS + step) * secondsPerStep;
                    if (step % 2 === 1 && this.swing > 0) {
                        time += secondsPerStep * (this.swing / 100) * 0.5;
                    }

                    for (let ch = 0; ch < CHANNELS.length; ch++) {
                        const data = this.seq.pattern[ch][step];
                        if (!data.on) continue;
                        this.renderSynthOffline(offlineCtx, CHANNELS[ch].synth, time, data.velocity, data.note, compressor, noiseBuffer);
                    }
                }
            }

            const renderedBuffer = await offlineCtx.startRendering();

            const wav = this.encodeWAV(renderedBuffer);
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'funkybeats-export-' + Date.now() + '.wav';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            this.updateStatus('WAV exported successfully!');
        }

        renderSynthOffline(ctx, synthName, time, velocity, note, dest, noiseBuffer) {
            const freq = 440 * Math.pow(2, (note - 69) / 12);

            switch (synthName) {
                case 'kick': {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(160, time);
                    osc.frequency.exponentialRampToValueAtTime(32, time + 0.12);
                    gain.gain.setValueAtTime(velocity * 0.9, time);
                    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
                    osc.connect(gain);
                    gain.connect(dest);
                    osc.start(time);
                    osc.stop(time + 0.45);
                    break;
                }
                case 'snare': {
                    const noise = ctx.createBufferSource();
                    noise.buffer = noiseBuffer;
                    const nf = ctx.createBiquadFilter();
                    nf.type = 'highpass'; nf.frequency.value = 2000;
                    const ng = ctx.createGain();
                    ng.gain.setValueAtTime(velocity * 0.7, time);
                    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
                    noise.connect(nf);
                    nf.connect(ng);
                    ng.connect(dest);
                    noise.start(time); noise.stop(time + 0.25);
                    const osc = ctx.createOscillator();
                    const og = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(220, time);
                    osc.frequency.exponentialRampToValueAtTime(110, time + 0.04);
                    og.gain.setValueAtTime(velocity * 0.4, time);
                    og.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
                    osc.connect(og);
                    og.connect(dest);
                    osc.start(time); osc.stop(time + 0.12);
                    break;
                }
                case 'hihat': {
                    const noise = ctx.createBufferSource();
                    noise.buffer = noiseBuffer;
                    const f = ctx.createBiquadFilter();
                    f.type = 'highpass'; f.frequency.value = 7000;
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(velocity * 0.4, time);
                    g.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
                    noise.connect(f);
                    f.connect(g);
                    g.connect(dest);
                    noise.start(time); noise.stop(time + 0.1);
                    break;
                }
                case 'clap': {
                    const noise = ctx.createBufferSource();
                    noise.buffer = noiseBuffer;
                    const f = ctx.createBiquadFilter();
                    f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 2;
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(velocity * 0.6, time + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
                    noise.connect(f);
                    f.connect(g);
                    g.connect(dest);
                    noise.start(time); noise.stop(time + 0.3);
                    break;
                }
                case 'perc': {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(800, time);
                    osc.frequency.exponentialRampToValueAtTime(200, time + 0.05);
                    g.gain.setValueAtTime(velocity * 0.5, time);
                    g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
                    osc.connect(g);
                    g.connect(dest);
                    osc.start(time); osc.stop(time + 0.15);
                    break;
                }
                case 'bass': {
                    const osc = ctx.createOscillator();
                    osc.type = 'sawtooth'; osc.frequency.value = freq;
                    const flt = ctx.createBiquadFilter();
                    flt.type = 'lowpass';
                    flt.frequency.setValueAtTime(freq * 6, time);
                    flt.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.15);
                    flt.Q.value = 5;
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(0, time);
                    g.gain.linearRampToValueAtTime(velocity * 0.6, time + 0.005);
                    g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
                    osc.connect(flt);
                    flt.connect(g);
                    g.connect(dest);
                    osc.start(time); osc.stop(time + 0.35);
                    break;
                }
                case 'lead': {
                    const osc = ctx.createOscillator();
                    osc.type = 'sawtooth'; osc.frequency.value = freq;
                    const osc2 = ctx.createOscillator();
                    osc2.type = 'sawtooth'; osc2.frequency.value = freq * 1.005;
                    const flt = ctx.createBiquadFilter();
                    flt.type = 'lowpass';
                    flt.frequency.setValueAtTime(freq * 8, time);
                    flt.frequency.exponentialRampToValueAtTime(freq * 2, time + 0.3);
                    flt.Q.value = 3;
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(0, time);
                    g.gain.linearRampToValueAtTime(velocity * 0.35, time + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
                    osc.connect(flt);
                    osc2.connect(flt);
                    flt.connect(g);
                    g.connect(dest);
                    osc.start(time); osc2.start(time);
                    osc.stop(time + 0.45); osc2.stop(time + 0.45);
                    break;
                }
                case 'pad': {
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(0, time);
                    g.gain.linearRampToValueAtTime(velocity * 0.2, time + 0.15);
                    g.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
                    g.connect(dest);
                    for (const d of [-12, -5, 0, 5, 12]) {
                        const osc = ctx.createOscillator();
                        osc.type = 'sine'; osc.frequency.value = freq; osc.detune.value = d;
                        const mg = ctx.createGain(); mg.gain.value = 0.2;
                        osc.connect(mg);
                        mg.connect(g);
                        osc.start(time); osc.stop(time + 0.85);
                    }
                    break;
                }
            }
        }

        encodeWAV(buffer) {
            const numChannels = buffer.numberOfChannels;
            const sampleRate = buffer.sampleRate;
            const bitsPerSample = 16;
            const blockAlign = numChannels * bitsPerSample / 8;
            const byteRate = sampleRate * blockAlign;
            const dataLength = buffer.length * blockAlign;
            const totalLength = 44 + dataLength;

            const arrayBuffer = new ArrayBuffer(totalLength);
            const view = new DataView(arrayBuffer);

            this.writeString(view, 0, 'RIFF');
            view.setUint32(4, totalLength - 8, true);
            this.writeString(view, 8, 'WAVE');
            this.writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bitsPerSample, true);
            this.writeString(view, 36, 'data');
            view.setUint32(40, dataLength, true);

            const channels = [];
            for (let ch = 0; ch < numChannels; ch++) {
                channels.push(buffer.getChannelData(ch));
            }

            let offset = 44;
            for (let i = 0; i < buffer.length; i++) {
                for (let ch = 0; ch < numChannels; ch++) {
                    const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                    offset += 2;
                }
            }

            return arrayBuffer;
        }

        writeString(view, offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        // ---- Status ----
        updateStatus(msg) {
            document.getElementById('status-left').textContent = msg;
        }
    }

    // ---- Start App ----
    window.addEventListener('DOMContentLoaded', () => {
        window.app = new FunkyBeatsApp();
    });

})();
