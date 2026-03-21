// ============================================
// FUNKYBEATS - Complete Electronic Music Producer
// Web Audio API Synthesized DAW Clone
// v3.0 - Phase 1: Variable Length, Note Duration,
//        Velocity Lane, Automation, Metronome
// ============================================

(() => {
    'use strict';

    // ---- Constants ----
    const DEFAULT_STEPS = 16;
    const NUM_PATTERNS = 8;
    const MAX_UNDO = 50;
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

    // QWERTY keyboard piano mapping
    const PIANO_KEYS = { 'z':0,'s':1,'x':2,'d':3,'c':4,'v':5,'g':6,'b':7,'h':8,'n':9,'j':10,'m':11 };

    // ---- DOM Helper (safe, no innerHTML) ----
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

    // Helper to convert MIDI note to frequency
    function midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    // Helper to get note name from MIDI
    function midiNoteName(note) {
        return NOTE_NAMES[note % 12] + Math.floor(note / 12 - 1);
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

            // Metronome
            this.metronomeGain = null;

            // Sidechain
            this.sidechainAmount = 0;
            this.sidechainRelease = 200;
            this.sidechainGains = []; // per non-kick channel

            // Per-channel synth parameters
            this.channelParams = [];
            this.initChannelParams();

            // Open hihat choke tracking
            this.openHatNodes = [];
        }

        initChannelParams() {
            this.channelParams = CHANNELS.map((ch, i) => {
                if (ch.type === 'drum') {
                    return { tune: 0, decay: 50, tone: 50, drive: 0 };
                } else {
                    return { waveform: 'sawtooth', attack: 10, decay: 50, cutoff: 70, resonance: 5, detune: 5 };
                }
            });
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
            this.reverbGain = this.ctx.createGain();
            this.reverbGain.gain.value = 0.2;
            await this.createReverbImpulse(2, 2);

            // Delay
            this.delayNode = this.ctx.createDelay(2);
            this.delayNode.delayTime.value = 0.375;
            this.delayFeedback = this.ctx.createGain();
            this.delayFeedback.gain.value = 0.3;
            this.delayGain = this.ctx.createGain();
            this.delayGain.gain.value = 0;

            // Metronome gain (bypasses effects, goes directly to destination)
            this.metronomeGain = this.ctx.createGain();
            this.metronomeGain.gain.value = 0.5;
            this.metronomeGain.connect(this.ctx.destination);

            // Channel gains and pans
            for (let i = 0; i < CHANNELS.length; i++) {
                const gain = this.ctx.createGain();
                gain.gain.value = 0.8;
                const pan = this.ctx.createStereoPanner();
                pan.pan.value = 0;
                this.channelGains.push(gain);
                this.channelPans.push(pan);

                // Sidechain gain node for non-kick channels
                const scGain = this.ctx.createGain();
                scGain.gain.value = 1;
                this.sidechainGains.push(scGain);

                // Routing: channelGain -> pan -> sidechainGain -> filter
                gain.connect(pan);
                pan.connect(scGain);
                scGain.connect(this.filterNode);
            }

            // Signal chain: filter -> distortion -> compressor -> masterGain -> analyser -> destination
            this.filterNode.connect(this.distortionNode);
            this.distortionNode.connect(this.compressor);
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);

            // Reverb send: filter -> reverbNode -> reverbGain -> masterGain
            this.filterNode.connect(this.reverbNode);
            this.reverbNode.connect(this.reverbGain);
            this.reverbGain.connect(this.masterGain);

            // Delay send: filter -> delayNode -> delayFeedback -> delayNode, delayNode -> delayGain -> masterGain
            this.filterNode.connect(this.delayNode);
            this.delayNode.connect(this.delayFeedback);
            this.delayFeedback.connect(this.delayNode);
            this.delayNode.connect(this.delayGain);
            this.delayGain.connect(this.masterGain);

            this.initialized = true;
        }

        async createReverbImpulse(duration, decay) {
            const rate = this.ctx.sampleRate;
            const length = rate * duration;
            const impulse = this.ctx.createBuffer(2, length, rate);
            for (let ch = 0; ch < 2; ch++) {
                const channelData = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
                }
            }
            this.reverbNode.buffer = impulse;
        }

        makeDistortionCurve(amount) {
            const k = amount * 4;
            const samples = 44100;
            const curve = new Float32Array(samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                curve[i] = k < 1 ? x : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            }
            return curve;
        }

        // Sidechain: duck non-kick channels when kick fires
        triggerSidechain(time) {
            if (this.sidechainAmount <= 0) return;
            for (let i = 1; i < CHANNELS.length; i++) {
                const scGain = this.sidechainGains[i];
                scGain.gain.cancelScheduledValues(time);
                scGain.gain.setValueAtTime(1 - this.sidechainAmount, time);
                scGain.gain.linearRampToValueAtTime(1, time + this.sidechainRelease / 1000);
            }
        }

        // Apply drive (overdrive/saturation) to a signal
        applyDrive(node, driveAmount, time) {
            if (driveAmount <= 0) return node;
            const waveshaper = this.ctx.createWaveShaper();
            waveshaper.curve = this.makeDistortionCurve(driveAmount / 25);
            waveshaper.oversample = '4x';
            const preGain = this.ctx.createGain();
            preGain.gain.value = 1 + driveAmount / 50;
            const postGain = this.ctx.createGain();
            postGain.gain.value = 1 / (1 + driveAmount / 50);
            node.connect(preGain);
            preGain.connect(waveshaper);
            waveshaper.connect(postGain);
            return postGain;
        }

        // ---- Metronome Click ----
        playClick(time, isDownbeat) {
            if (!this.ctx || !this.metronomeGain) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = isDownbeat ? 1000 : 800;
            gain.gain.setValueAtTime(this.metronomeGain.gain.value, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
            osc.connect(gain);
            gain.connect(this.metronomeGain);
            osc.start(time);
            osc.stop(time + 0.03);
        }

        // ---- Drum Voices ----
        playKick(time, velocity = 0.8, channelIdx = 0) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const tuneRatio = Math.pow(2, params.tune / 12);
            const decayScale = 0.1 + (params.decay / 100) * 0.6;
            const toneFreq = 40 + (params.tone / 100) * 40;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime((150 + toneFreq) * tuneRatio, time);
            osc.frequency.exponentialRampToValueAtTime(50 * tuneRatio, time + 0.04);
            gain.gain.setValueAtTime(velocity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + decayScale);

            let output = gain;
            if (params.drive > 0) {
                output = this.applyDrive(gain, params.drive, time);
            } else {
                osc.connect(gain);
            }
            if (params.drive > 0) osc.connect(gain);
            output.connect(this.channelGains[channelIdx]);

            osc.start(time);
            osc.stop(time + decayScale + 0.01);

            // Sub layer
            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(80 * tuneRatio, time);
            subOsc.frequency.exponentialRampToValueAtTime(40 * tuneRatio, time + 0.08);
            subGain.gain.setValueAtTime(velocity * 0.6, time);
            subGain.gain.exponentialRampToValueAtTime(0.001, time + decayScale * 0.8);
            subOsc.connect(subGain);
            subGain.connect(this.channelGains[channelIdx]);
            subOsc.start(time);
            subOsc.stop(time + decayScale + 0.01);

            // Trigger sidechain
            this.triggerSidechain(time);
        }

        playSnare(time, velocity = 0.8, channelIdx = 1) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const tuneRatio = Math.pow(2, params.tune / 12);
            const decayScale = 0.05 + (params.decay / 100) * 0.25;
            const brightness = 2000 + (params.tone / 100) * 8000;

            // Tone
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200 * tuneRatio, time);
            osc.frequency.exponentialRampToValueAtTime(120 * tuneRatio, time + 0.03);
            oscGain.gain.setValueAtTime(velocity * 0.7, time);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + decayScale * 0.6);
            osc.connect(oscGain);
            oscGain.connect(this.channelGains[channelIdx]);
            osc.start(time);
            osc.stop(time + decayScale + 0.01);

            // Noise
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const noiseGain = this.ctx.createGain();
            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = brightness;
            noiseGain.gain.setValueAtTime(velocity * 0.5, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decayScale);

            let output = noiseGain;
            if (params.drive > 0) {
                output = this.applyDrive(noiseGain, params.drive, time);
                noise.connect(noiseFilter);
                noiseFilter.connect(noiseGain);
            } else {
                noise.connect(noiseFilter);
                noiseFilter.connect(noiseGain);
            }
            output.connect(this.channelGains[channelIdx]);
            noise.start(time);
            noise.stop(time + decayScale + 0.01);
        }

        playHihat(time, velocity = 0.8, channelIdx = 2, isOpen = false) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const tuneRatio = Math.pow(2, params.tune / 12);
            const baseDecay = isOpen ? 0.25 : 0.08;
            const decayScale = baseDecay * (0.3 + (params.decay / 100) * 1.4);
            const brightness = 5000 + (params.tone / 100) * 10000;

            // Choke any open hats if this is a closed hat
            if (!isOpen) {
                for (const hatNode of this.openHatNodes) {
                    try {
                        hatNode.gain.cancelScheduledValues(time);
                        hatNode.gain.setValueAtTime(hatNode.gain.value, time);
                        hatNode.gain.exponentialRampToValueAtTime(0.001, time + 0.01);
                    } catch (e) { /* ignore */ }
                }
                this.openHatNodes = [];
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const noiseGain = this.ctx.createGain();
            const bandpass = this.ctx.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.value = brightness * tuneRatio;
            bandpass.Q.value = 1.5;
            const highpass = this.ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = (7000 + (params.tone / 100) * 5000) * tuneRatio;

            noiseGain.gain.setValueAtTime(velocity * 0.4, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decayScale);

            noise.connect(bandpass);
            bandpass.connect(highpass);
            highpass.connect(noiseGain);

            let output = noiseGain;
            if (params.drive > 0) {
                output = this.applyDrive(noiseGain, params.drive, time);
            }
            output.connect(this.channelGains[channelIdx]);

            noise.start(time);
            noise.stop(time + decayScale + 0.05);

            // Track open hat nodes for choking
            if (isOpen) {
                this.openHatNodes.push(noiseGain);
                // Auto-cleanup after decay
                setTimeout(() => {
                    const idx = this.openHatNodes.indexOf(noiseGain);
                    if (idx > -1) this.openHatNodes.splice(idx, 1);
                }, (decayScale + 0.1) * 1000);
            }
        }

        playClap(time, velocity = 0.8, channelIdx = 3) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const decayScale = 0.08 + (params.decay / 100) * 0.2;
            const brightness = 1000 + (params.tone / 100) * 4000;

            // Multiple bursts for clap texture
            for (let burst = 0; burst < 3; burst++) {
                const noise = this.ctx.createBufferSource();
                noise.buffer = this.noiseBuffer;
                const noiseGain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = brightness;
                filter.Q.value = 2;

                const burstTime = time + burst * 0.01;
                noiseGain.gain.setValueAtTime(velocity * 0.5, burstTime);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, burstTime + decayScale);

                noise.connect(filter);
                filter.connect(noiseGain);

                let output = noiseGain;
                if (params.drive > 0) {
                    output = this.applyDrive(noiseGain, params.drive, time);
                }
                output.connect(this.channelGains[channelIdx]);
                noise.start(burstTime);
                noise.stop(burstTime + decayScale + 0.01);
            }
        }

        playPerc(time, velocity = 0.8, channelIdx = 4) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const tuneRatio = Math.pow(2, params.tune / 12);
            const decayScale = 0.03 + (params.decay / 100) * 0.15;
            const brightness = 800 + (params.tone / 100) * 2000;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(brightness * tuneRatio, time);
            osc.frequency.exponentialRampToValueAtTime(200 * tuneRatio, time + 0.02);
            gain.gain.setValueAtTime(velocity * 0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + decayScale);
            osc.connect(gain);

            let output = gain;
            if (params.drive > 0) {
                output = this.applyDrive(gain, params.drive, time);
            }
            output.connect(this.channelGains[channelIdx]);
            osc.start(time);
            osc.stop(time + decayScale + 0.01);
        }

        // ---- Synth Voices ----
        playBass(time, note = 36, velocity = 0.8, channelIdx = 5, noteLength = 0.2) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const freq = midiToFreq(note);
            const attackTime = (params.attack / 100) * 0.3;
            const decayTime = Math.max(0.05 + (params.decay / 100) * 0.5, noteLength);
            const cutoff = 200 + (params.cutoff / 100) * 4000;

            const osc = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = params.waveform || 'sawtooth';
            osc.frequency.value = freq;
            osc.detune.value = -(params.detune || 5);
            osc2.type = params.waveform || 'sawtooth';
            osc2.frequency.value = freq;
            osc2.detune.value = (params.detune || 5);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(cutoff * 2, time);
            filter.frequency.exponentialRampToValueAtTime(cutoff, time + attackTime + decayTime * 0.5);
            filter.Q.value = params.resonance || 5;

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.4, time + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);

            osc.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
            gain.connect(this.channelGains[channelIdx]);

            osc.start(time);
            osc2.start(time);
            osc.stop(time + attackTime + decayTime + 0.01);
            osc2.stop(time + attackTime + decayTime + 0.01);
        }

        playLead(time, note = 60, velocity = 0.8, channelIdx = 6, noteLength = 0.2) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const freq = midiToFreq(note);
            const attackTime = (params.attack / 100) * 0.2;
            const decayTime = Math.max(0.05 + (params.decay / 100) * 0.4, noteLength);
            const cutoff = 500 + (params.cutoff / 100) * 8000;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = params.waveform || 'sawtooth';
            osc.frequency.value = freq;
            osc.detune.value = params.detune || 5;

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(cutoff * 1.5, time);
            filter.frequency.exponentialRampToValueAtTime(cutoff, time + decayTime);
            filter.Q.value = params.resonance || 5;

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.35, time + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.channelGains[channelIdx]);

            osc.start(time);
            osc.stop(time + attackTime + decayTime + 0.01);
        }

        playPad(time, note = 60, velocity = 0.8, channelIdx = 7, noteLength = 0.5) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const freq = midiToFreq(note);
            const attackTime = 0.02 + (params.attack / 100) * 0.5;
            const decayTime = Math.max(0.2 + (params.decay / 100) * 1.5, noteLength);
            const cutoff = 300 + (params.cutoff / 100) * 5000;

            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const osc3 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc1.type = params.waveform || 'sawtooth';
            osc1.frequency.value = freq;
            osc1.detune.value = -(params.detune || 5);
            osc2.type = params.waveform || 'sawtooth';
            osc2.frequency.value = freq;
            osc2.detune.value = (params.detune || 5);
            osc3.type = 'sine';
            osc3.frequency.value = freq * 0.5;

            filter.type = 'lowpass';
            filter.frequency.value = cutoff;
            filter.Q.value = params.resonance || 3;

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.25, time + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);

            osc1.connect(filter);
            osc2.connect(filter);
            osc3.connect(filter);
            filter.connect(gain);
            gain.connect(this.channelGains[channelIdx]);

            osc1.start(time);
            osc2.start(time);
            osc3.start(time);
            osc1.stop(time + attackTime + decayTime + 0.01);
            osc2.stop(time + attackTime + decayTime + 0.01);
            osc3.stop(time + attackTime + decayTime + 0.01);
        }

        // ---- Play any channel ----
        playChannel(channelIdx, time, velocity, note, isOpen, noteLength) {
            if (!this.ctx) return;
            // Check mute/solo
            const hasSolo = this.channelSolo.some(s => s);
            if (hasSolo && !this.channelSolo[channelIdx]) return;
            if (!hasSolo && this.channelMuted[channelIdx]) return;

            switch (channelIdx) {
                case 0: this.playKick(time, velocity, channelIdx); break;
                case 1: this.playSnare(time, velocity, channelIdx); break;
                case 2: this.playHihat(time, velocity, channelIdx, isOpen); break;
                case 3: this.playClap(time, velocity, channelIdx); break;
                case 4: this.playPerc(time, velocity, channelIdx); break;
                case 5: this.playBass(time, note || 36, velocity, channelIdx, noteLength); break;
                case 6: this.playLead(time, note || 60, velocity, channelIdx, noteLength); break;
                case 7: this.playPad(time, note || 60, velocity, channelIdx, noteLength); break;
            }
        }

        // Preview a note on a channel (for piano keyboard)
        previewNote(channelIdx, note) {
            if (!this.ctx) return;
            const time = this.ctx.currentTime;
            switch (channelIdx) {
                case 0: this.playKick(time, 0.7, 0); break;
                case 1: this.playSnare(time, 0.7, 1); break;
                case 2: this.playHihat(time, 0.7, 2, false); break;
                case 3: this.playClap(time, 0.7, 3); break;
                case 4: this.playPerc(time, 0.7, 4); break;
                case 5: this.playBass(time, note, 0.7, 5); break;
                case 6: this.playLead(time, note, 0.7, 6); break;
                case 7: this.playPad(time, note, 0.7, 7); break;
            }
        }

        setMasterVolume(val) {
            if (this.masterGain) this.masterGain.gain.value = val;
        }

        setFilterFreq(freq) {
            if (this.filterNode) this.filterNode.frequency.value = freq;
        }

        setFilterQ(q) {
            if (this.filterNode) this.filterNode.Q.value = q;
        }

        setDistortion(amount) {
            if (this.distortionNode) {
                this.distortionNode.curve = this.makeDistortionCurve(amount);
            }
        }

        setReverbMix(val) {
            if (this.reverbGain) this.reverbGain.gain.value = val;
        }

        setDelayMix(val) {
            if (this.delayGain) this.delayGain.gain.value = val;
        }

        setDelayTime(val) {
            if (this.delayNode) this.delayNode.delayTime.value = val;
        }

        setCompressor(amount) {
            if (this.compressor) {
                this.compressor.threshold.value = -24 - amount * 12;
                this.compressor.ratio.value = 2 + amount * 10;
            }
        }

        getAnalyserData() {
            if (!this.analyser) return null;
            const data = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(data);
            return data;
        }

        getWaveformData() {
            if (!this.analyser) return null;
            const data = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteTimeDomainData(data);
            return data;
        }
    }

    // ---- Sequencer State ----
    class SequencerState {
        constructor() {
            this.patterns = [];
            this.currentPattern = 0;
            this.undoStack = [];
            this.redoStack = [];
            this.patternClipboard = null;
            this.songChain = [];
            this.initPatterns();
        }

        initPatterns() {
            this.patterns = [];
            for (let p = 0; p < NUM_PATTERNS; p++) {
                this.patterns.push(this.createEmptyPattern(DEFAULT_STEPS));
            }
        }

        createEmptyPattern(length) {
            const stepsCount = length || DEFAULT_STEPS;
            const channels = [];
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                const channel = [];
                for (let s = 0; s < stepsCount; s++) {
                    channel.push({
                        on: false,
                        velocity: 0.8,
                        note: CHANNELS[ch].type === 'synth' ? 48 : 0,
                        open: false,
                        duration: 1
                    });
                }
                channels.push(channel);
            }
            return { stepsCount: stepsCount, channels: channels, automation: {} };
        }

        getSteps() {
            return this.patterns[this.currentPattern].stepsCount;
        }

        getStep(ch, step) {
            return this.patterns[this.currentPattern].channels[ch][step];
        }

        getCurrentPattern() {
            return this.patterns[this.currentPattern];
        }

        getCurrentPatternChannels() {
            return this.patterns[this.currentPattern].channels;
        }

        // Change pattern length, preserving existing data
        setPatternLength(newLength) {
            const pat = this.patterns[this.currentPattern];
            const oldLength = pat.stepsCount;
            if (newLength === oldLength) return;

            for (let ch = 0; ch < CHANNELS.length; ch++) {
                if (newLength > oldLength) {
                    // Extend
                    for (let s = oldLength; s < newLength; s++) {
                        pat.channels[ch].push({
                            on: false,
                            velocity: 0.8,
                            note: CHANNELS[ch].type === 'synth' ? 48 : 0,
                            open: false,
                            duration: 1
                        });
                    }
                } else {
                    // Truncate
                    pat.channels[ch].length = newLength;
                }
            }

            // Fix automation arrays
            if (pat.automation) {
                for (const key of Object.keys(pat.automation)) {
                    const arr = pat.automation[key];
                    if (newLength > oldLength) {
                        while (arr.length < newLength) arr.push(null);
                    } else {
                        arr.length = newLength;
                    }
                }
            }

            pat.stepsCount = newLength;
        }

        // ---- Undo/Redo ----
        pushUndo() {
            const snapshot = JSON.stringify(this.patterns[this.currentPattern]);
            this.undoStack.push({ patternIdx: this.currentPattern, data: snapshot });
            if (this.undoStack.length > MAX_UNDO) {
                this.undoStack.shift();
            }
            this.redoStack = [];
        }

        undo() {
            if (this.undoStack.length === 0) return false;
            const entry = this.undoStack.pop();
            // Save current state to redo
            const currentSnapshot = JSON.stringify(this.patterns[entry.patternIdx]);
            this.redoStack.push({ patternIdx: entry.patternIdx, data: currentSnapshot });
            // Restore
            this.patterns[entry.patternIdx] = JSON.parse(entry.data);
            this.currentPattern = entry.patternIdx;
            return true;
        }

        redo() {
            if (this.redoStack.length === 0) return false;
            const entry = this.redoStack.pop();
            // Save current to undo
            const currentSnapshot = JSON.stringify(this.patterns[entry.patternIdx]);
            this.undoStack.push({ patternIdx: entry.patternIdx, data: currentSnapshot });
            // Restore
            this.patterns[entry.patternIdx] = JSON.parse(entry.data);
            this.currentPattern = entry.patternIdx;
            return true;
        }

        // ---- Copy/Paste/Clear ----
        copyPattern() {
            this.patternClipboard = JSON.parse(JSON.stringify(this.patterns[this.currentPattern]));
        }

        pastePattern() {
            if (!this.patternClipboard) return false;
            this.pushUndo();
            this.patterns[this.currentPattern] = JSON.parse(JSON.stringify(this.patternClipboard));
            return true;
        }

        clearPattern() {
            this.pushUndo();
            const len = this.patterns[this.currentPattern].stepsCount;
            this.patterns[this.currentPattern] = this.createEmptyPattern(len);
        }

        // ---- Serialization ----
        serialize() {
            return {
                patterns: JSON.parse(JSON.stringify(this.patterns)),
                songChain: [...this.songChain],
                currentPattern: this.currentPattern
            };
        }

        deserialize(data) {
            if (data.patterns) {
                this.patterns = data.patterns;
                // Ensure all patterns have correct structure
                while (this.patterns.length < NUM_PATTERNS) {
                    this.patterns.push(this.createEmptyPattern(DEFAULT_STEPS));
                }
            }
            if (data.songChain) {
                this.songChain = data.songChain;
            }
            if (typeof data.currentPattern === 'number') {
                this.currentPattern = data.currentPattern;
            }
        }
    }

    // ---- PRESETS ----
    const PRESETS = {
        'four-on-floor': { bpm: 128, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12] }, 2: { on: [0,2,4,6,8,10,12,14] }, 3: { on: [4,12], velocity: [,,,, 0.9,,,,,,,,0.7] }, 5: { on: [0,3,6,10,12], notes: [36,36,39,36,41] }, 7: { on: [0,8], notes: [60,64] } } },
        'breakbeat': { bpm: 140, steps: { 0: { on: [0,3,6,10,14] }, 1: { on: [4,12] }, 2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.8,0.4,0.6,0.4,0.8,0.4,0.6,0.4,0.8,0.4,0.6,0.4,0.8,0.4,0.6,0.4] }, 3: { on: [4,11] }, 4: { on: [2,8,14] }, 5: { on: [0,6,10,12], notes: [36,39,36,41] } } },
        'minimal-techno': { bpm: 132, steps: { 0: { on: [0,4,8,12] }, 2: { on: [2,6,10,14], velocity: [,, 0.5,,,,0.5,,,,0.5,,,,0.5] }, 3: { on: [4] }, 4: { on: [7,15] }, 5: { on: [0,8,10], notes: [36,36,39] }, 6: { on: [6,14], notes: [72,75] } } },
        'deep-house': { bpm: 122, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12] }, 2: { on: [0,2,4,6,8,10,12,14], velocity: [0.6,0.3,0.7,0.3,0.6,0.3,0.7,0.3,0.6,0.3,0.7,0.3,0.6,0.3,0.7,0.3] }, 3: { on: [3,11] }, 5: { on: [0,3,6,8,10,14], notes: [36,36,38,36,41,39] }, 7: { on: [0], notes: [60] } } },
        'drum-n-bass': { bpm: 174, steps: { 0: { on: [0,6,10] }, 1: { on: [4,12] }, 2: { on: [0,2,4,6,8,10,12,14] }, 3: { on: [4,7,12,15] }, 4: { on: [2,10] }, 5: { on: [0,3,6,8,10,14], notes: [36,39,36,41,36,43] } } },

        'phonk-jackin': { bpm: 126, steps: { 0: { on: [0,3,4,8,11,12], velocity: [0.9,0.5,0.85,0.9,0.5,0.85,0.9,0.5,0.85,0.9,0.5,0.85,0.9,0.5,0.85,0.9] }, 1: { on: [4,12] }, 2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.5,0.3,0.8,0.35,0.5,0.3,0.8,0.35,0.5,0.3,0.8,0.35,0.5,0.3,0.8,0.35] }, 3: { on: [4,7,12,15], velocity: [,,,,0.8,,,0.45,,,,,,0.8,,,0.45] }, 4: { on: [2,5,7,10,13,15], velocity: [,,0.6,,,0.5,,0.7,,,0.6,,,0.5,,0.7] }, 5: { on: [0,3,6,8,11,14], notes: [36,39,43,36,46,41] }, 6: { on: [2,6,10,14], notes: [75,67,75,72] } } },
        'phonk-filtered-disko': { bpm: 124, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12] }, 2: { on: [2,6,10,14], velocity: [,,0.8,,,,0.7,,,,0.8,,,,0.7] }, 3: { on: [4,7,12,15], velocity: [,,,,0.8,,,0.5,,,,,,0.8,,,0.5] }, 4: { on: [0,4,8,12], velocity: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5] }, 5: { on: [0,2,4,6,8,10,12,14], notes: [36,48,41,48,36,48,43,48] }, 6: { on: [3,7,11,15], notes: [75,79,75,72] }, 7: { on: [0,8], notes: [60,63] } } },
        'phonk-bumpin': { bpm: 125, steps: { 0: { on: [0,4,7,8,12], velocity: [0.9,0.9,0.55,0.9,0.9,0.9,0.9,0.55,0.9,0.9,0.9,0.9,0.55,0.9,0.9,0.9] }, 1: { on: [4,12] }, 2: { on: [0,2,4,6,8,10,12,14], velocity: [0.5,0.5,0.8,0.5,0.5,0.5,0.8,0.5,0.5,0.5,0.8,0.5,0.5,0.5,0.8,0.5] }, 3: { on: [4,12], velocity: [,,,,0.7,,,,,,,,0.6] }, 4: { on: [2,5,7,10,13,15], velocity: [,,0.7,,,0.6,,0.8,,,0.7,,,0.6,,0.8] }, 5: { on: [0,6,8,14], notes: [36,41,36,43] }, 6: { on: [6,14], notes: [75,72] }, 7: { on: [0,4,8,12], notes: [60,63,60,63] } } },
        'phonk-stabs': { bpm: 126, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12], velocity: [,,,,0.6,,,,,,,,0.6] }, 2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.7,0.25,0.5,0.3,0.7,0.25,0.5,0.3,0.7,0.25,0.5,0.3,0.7,0.25,0.5,0.3] }, 3: { on: [3,7,11,15], velocity: [,,,0.7,,,,0.6,,,,0.7,,,,0.6] }, 4: { on: [2,10] }, 5: { on: [0,3,5,6,8,11,13,14], notes: [36,39,40,41,36,43,41,39] }, 6: { on: [2,6,10,14], notes: [75,67,70,72] } } },
        'phonk-deep-jackin': { bpm: 123, steps: { 0: { on: [0,4,8,11,12], velocity: [0.85,0.85,0.85,0.4,0.85,0.85,0.85,0.85,0.4,0.85,0.85,0.85,0.85,0.4,0.85,0.85] }, 1: { on: [4,12], velocity: [,,,,0.5,,,,,,,,0.5] }, 2: { on: [2,6,10,14], velocity: [,,0.5,,,,0.45,,,,0.5,,,,0.45] }, 3: { on: [4], velocity: [,,,,0.4] }, 4: { on: [7,15], velocity: [,,,,,,,0.5,,,,,,,,0.5] }, 5: { on: [0,6,8,14], notes: [36,41,36,46] }, 6: { on: [3,11], notes: [75,72] }, 7: { on: [0,4,8,12], notes: [60,63,67,63] } } },

        'storken-lille-vals': { bpm: 125, steps: { 0: { on: [0,4,8,12], velocity: [0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7] }, 1: { on: [4,12], velocity: [,,,,0.5,,,,,,,,0.5] }, 2: { on: [2,6,10,14], velocity: [,,0.6,,,,0.6,,,,0.6,,,,0.6] }, 3: { on: [4,12], velocity: [,,,,0.6,,,,,,,,0.6] }, 4: { on: [0,3,6,9,12,15], velocity: [0.6,0.45,0.5,0.45,0.6,0.45,0.6,0.45,0.5,0.45,0.6,0.45,0.6,0.45,0.5,0.45] }, 5: { on: [0,4,8,12], notes: [36,40,43,48] }, 6: { on: [0,2,4,6,8,10,12,14], notes: [72,76,79,76,72,76,79,76] }, 7: { on: [0,8], notes: [60,67] } } },
        'storken-skogsdisko': { bpm: 124, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12], velocity: [,,,,0.55,,,,,,,,0.55] }, 2: { on: [0,2,4,6,8,10,12,14], velocity: [0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4] }, 3: { on: [4,12], velocity: [,,,,0.5,,,,,,,,0.45] }, 4: { on: [3,7,11,15], velocity: [,,,0.4,,,,0.35,,,,0.4,,,,0.35] }, 5: { on: [0,3,6,8,11,14], notes: [36,38,40,43,45,43] }, 6: { on: [2,6,10,14], notes: [72,79,76,72] }, 7: { on: [0,8], notes: [60,64] } } },
        'storken-italo-arp': { bpm: 127, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12] }, 2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.7,0.3,0.5,0.3,0.7,0.3,0.5,0.3,0.7,0.3,0.5,0.3,0.7,0.3,0.5,0.3] }, 3: { on: [4,12] }, 4: { on: [2,10], velocity: [,,0.4,,,,,,,,0.4] }, 5: { on: [0,2,4,6,8,10,12,14], notes: [46,58,46,58,46,58,46,58] }, 6: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], notes: [70,74,77,82,77,74,70,74,77,82,77,74,70,74,77,82] } } },
        'storken-scandi-cosmic': { bpm: 123, steps: { 0: { on: [0,4,8,12], velocity: [0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7] }, 1: { on: [4,12], velocity: [,,,,0.4,,,,,,,,0.4] }, 2: { on: [2,6,10,14], velocity: [,,0.5,,,,0.45,,,,0.5,,,,0.45] }, 3: { on: [7,15], velocity: [,,,,,,,0.45,,,,,,,,0.45] }, 4: { on: [3,11], velocity: [,,,0.4,,,,,,,,0.4] }, 5: { on: [0,4,8,12], notes: [36,43,48,45] }, 6: { on: [2,5,10,13], notes: [72,79,77,74] }, 7: { on: [0,4,8,12], notes: [60,64,67,64] } } },
        'storken-stupidisco': { bpm: 127, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12] }, 2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.8,0.35,0.55,0.35,0.8,0.35,0.55,0.35,0.8,0.35,0.55,0.35,0.8,0.35,0.55,0.35] }, 3: { on: [4,7,12,15], velocity: [,,,,0.8,,,0.5,,,,,,0.8,,,0.5] }, 4: { on: [0,2,4,6,8,10,12,14], velocity: [0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45] }, 5: { on: [0,3,6,8,10,12], notes: [36,40,43,48,45,43] }, 6: { on: [2,6,10,14], notes: [76,79,72,76] }, 7: { on: [0,8], notes: [60,65] } } },

        'hammann-808mate': { bpm: 122, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4], velocity: [,,,,0.5] }, 2: { on: [0,2,4,6,8,10,12,14], velocity: [0.55,0.55,0.3,0.55,0.55,0.55,0.3,0.55,0.55,0.55,0.3,0.55,0.55,0.55,0.3,0.55] }, 3: { on: [12], velocity: [,,,,,,,,,,,,0.3] }, 5: { on: [0,2,4,6,8,10,12,14], notes: [36,38,39,38,36,34,36,39] } , 6: { on: [3,11], notes: [63,60] } } },
        'hammann-liquid': { bpm: 120, steps: { 0: { on: [0,4,8,12], velocity: [0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75,0.75] }, 1: { on: [4,12], velocity: [,,,,0.45,,,,,,,,0.45] }, 2: { on: [2,6,10,14], velocity: [,,0.45,,,,0.45,,,,0.45,,,,0.45] }, 3: { on: [4,12], velocity: [,,,,0.4,,,,,,,,0.35] }, 4: { on: [7], velocity: [,,,,,,,0.35] }, 5: { on: [0,6,8,14], notes: [33,40,33,43] }, 6: { on: [3,6,11,14], notes: [69,72,69,67] }, 7: { on: [0,8], notes: [57,60] } } },
        'hammann-wahwah': { bpm: 118, steps: { 0: { on: [0,4,8,12] }, 1: { on: [4,12], velocity: [,,,,0.55,,,,,,,,0.55] }, 2: { on: [0,2,4,6,8,10,12,14], velocity: [0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4,0.4,0.4,0.65,0.4] }, 3: { on: [3,11], velocity: [,,,0.5,,,,,,,,0.5] }, 4: { on: [2,5,10,13], velocity: [,,0.5,,,0.4,,,,,0.5,,,0.4] }, 5: { on: [0,3,6,8,11,14], notes: [33,36,38,40,36,33] }, 6: { on: [1,3,5,7,9,11,13,15], notes: [69,69,72,69,69,69,72,69] } } },
        'hammann-ffm-deep': { bpm: 119, steps: { 0: { on: [0,4,8,12], velocity: [0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65] }, 1: { on: [12], velocity: [,,,,,,,,,,,,0.35] }, 2: { on: [6,14], velocity: [,,,,,,0.35,,,,,,,,0.35] }, 5: { on: [0,4,8,12], notes: [38,41,38,45] }, 7: { on: [0,4,8,12], notes: [62,65,69,65] } } },
        'hammann-digger': { bpm: 124, steps: { 0: { on: [0,3,4,8,12], velocity: [0.8,0.5,0.8,0.8,0.8,0.8,0.8,0.8,0.5,0.8,0.8,0.8,0.8,0.8,0.8,0.8] }, 1: { on: [4,12] }, 2: { on: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], velocity: [0.6,0.25,0.45,0.25,0.6,0.25,0.45,0.25,0.6,0.25,0.45,0.25,0.6,0.25,0.45,0.25] }, 3: { on: [4], velocity: [,,,,0.7] }, 4: { on: [3,7,11], velocity: [,,,0.4,,,,0.35,,,,0.4] }, 5: { on: [0,3,6,8,11,14], notes: [41,44,36,39,41,44] }, 6: { on: [2,6,10,14], notes: [68,72,65,68] }, 7: { on: [0,8], notes: [60,63] } } }
    };

    // ---- Main Application ----
    class FunkyBeatsApp {
        constructor() {
            this.audio = new AudioEngine();
            this.state = new SequencerState();

            // Transport state
            this.playing = false;
            this.recording = false;
            this.bpm = 128;
            this.swing = 0;
            this.currentStep = -1;
            this.schedulerTimer = null;
            this.nextStepTime = 0;
            this.scheduleAheadTime = 0.1;
            this.lookAhead = 25; // ms

            // Metronome
            this.metronome = { enabled: false, volume: 0.5 };

            // Play mode
            this.playMode = 'pattern'; // 'pattern' or 'song'
            this.songChainIndex = 0;
            this.songLoop = false;

            // Tap tempo
            this.tapTimes = [];

            // Piano roll
            this.pianoRollChannel = 5;
            this.pianoRollOctave = 3;

            // Piano roll drag state for note duration
            this.pianoRollDragging = false;
            this.pianoRollDragStep = -1;
            this.pianoRollDragNote = -1;
            this.pianoRollDragDuration = 1;

            // Velocity lane drag state
            this.velocityDragging = false;

            // Synth editor
            this.synthEditorChannel = 0;

            // Active tab
            this.activeTab = 'sequencer';

            // Automation
            this.automationParam = 'master-filter';
            this.automationDragging = false;

            // Visualizer animation
            this.animFrame = null;

            // DOM references
            this.stepElements = [];
            this.stepIndicators = [];
            this.mixerVUs = [];
            this.songSlotElements = [];

            // Piano canvas
            this.pianoCanvas = null;
            this.pianoCtx = null;

            // Automation canvas
            this.automationCanvas = null;
            this.automationCtx = null;

            // Init
            this.initUI();
            this.bindEvents();
            this.loadAutoSave();
            this.startVisualizer();
            this.setStatus('Ready');
        }

        // ---- UI Building ----
        initUI() {
            this.buildStepIndicators();
            this.buildSequencerGrid();
            this.buildMixer();
            this.buildPianoKeys();
            this.buildSynthEditorUI();
            this.buildSongChainUI();
            this.initPianoCanvas();
            this.initAutomationCanvas();
            this.syncStepsDropdown();
        }

        syncStepsDropdown() {
            const sel = document.getElementById('steps-select');
            if (sel) {
                sel.value = String(this.state.getSteps());
            }
        }

        buildStepIndicators() {
            const container = document.getElementById('step-indicators');
            // Clear existing
            while (container.firstChild) container.removeChild(container.firstChild);
            this.stepIndicators = [];
            const steps = this.state.getSteps();
            for (let i = 0; i < steps; i++) {
                const ind = el('div', { className: 'step-indicator' });
                if (i % 4 === 0) ind.classList.add('beat');
                this.stepIndicators.push(ind);
                container.appendChild(ind);
            }
        }

        buildSequencerGrid() {
            const grid = document.querySelector('.sequencer-grid');
            while (grid.firstChild) grid.removeChild(grid.firstChild);
            this.stepElements = [];
            const steps = this.state.getSteps();

            for (let ch = 0; ch < CHANNELS.length; ch++) {
                const row = el('div', { className: 'seq-row' });

                // Channel info
                const info = el('div', { className: 'seq-channel-info' });
                const colorBar = el('div', { className: 'seq-channel-color' });
                colorBar.style.backgroundColor = CHANNELS[ch].color;
                const name = el('span', { className: 'seq-channel-name', text: CHANNELS[ch].name });
                name.style.color = CHANNELS[ch].color;

                const btns = el('div', { className: 'seq-channel-btns' });
                const muteBtn = el('button', { className: 'seq-mute', text: 'M' });
                muteBtn.dataset.channel = ch;
                const soloBtn = el('button', { className: 'seq-solo', text: 'S' });
                soloBtn.dataset.channel = ch;
                btns.appendChild(muteBtn);
                btns.appendChild(soloBtn);

                info.appendChild(colorBar);
                info.appendChild(name);
                info.appendChild(btns);
                row.appendChild(info);

                // Steps container
                const stepsContainer = el('div', { className: 'seq-steps' });
                const channelSteps = [];

                for (let s = 0; s < steps; s++) {
                    // Group every 4 steps
                    if (s % 4 === 0) {
                        var group = el('div', { className: 'seq-step-group' });
                        stepsContainer.appendChild(group);
                    }

                    const step = el('div', { className: 'seq-step' });
                    step.dataset.channel = ch;
                    step.dataset.step = s;

                    // Fill div (colored background when on)
                    const fill = el('div', { className: 'step-fill' });
                    fill.style.backgroundColor = CHANNELS[ch].color;
                    step.appendChild(fill);

                    // Velocity bar
                    const velBar = el('div', { className: 'velocity-bar' });
                    step.appendChild(velBar);

                    group.appendChild(step);
                    channelSteps.push(step);
                }

                row.appendChild(stepsContainer);
                grid.appendChild(row);
                this.stepElements.push(channelSteps);
            }

            this.updateSequencerDisplay();
        }

        buildMixer() {
            const container = document.getElementById('mixer-channels');
            while (container.firstChild) container.removeChild(container.firstChild);
            this.mixerVUs = [];

            for (let i = 0; i < CHANNELS.length; i++) {
                const ch = el('div', { className: 'mixer-channel' });

                const colorDot = el('div', { className: 'mixer-color-dot' });
                colorDot.style.backgroundColor = CHANNELS[i].color;

                const name = el('div', { className: 'mixer-channel-name', text: CHANNELS[i].name });

                const vuContainer = el('div', { className: 'mixer-vu' });
                const vuFill = el('div', { className: 'mixer-vu-fill' });
                vuFill.style.height = '0%';
                vuContainer.appendChild(vuFill);
                this.mixerVUs.push(vuFill);

                const faderContainer = el('div', { className: 'mixer-fader-container' });
                const fader = el('input', { type: 'range', className: 'mixer-fader', min: '0', max: '100', value: '80' });
                fader.dataset.channel = i;
                faderContainer.appendChild(fader);

                const db = el('div', { className: 'mixer-db', text: '0.0dB' });

                const panContainer = el('div', { className: 'mixer-pan-container' });
                const panLabel = el('label', { text: 'PAN' });
                const pan = el('input', { type: 'range', className: 'mixer-pan', min: '-100', max: '100', value: '0' });
                pan.dataset.channel = i;
                panContainer.appendChild(panLabel);
                panContainer.appendChild(pan);

                const btnsDiv = el('div', { className: 'mixer-btns' });
                const muteBtn = el('button', { className: 'mixer-mute', text: 'M' });
                muteBtn.dataset.channel = i;
                const soloBtn = el('button', { className: 'mixer-solo', text: 'S' });
                soloBtn.dataset.channel = i;
                btnsDiv.appendChild(muteBtn);
                btnsDiv.appendChild(soloBtn);

                ch.appendChild(colorDot);
                ch.appendChild(name);
                ch.appendChild(vuContainer);
                ch.appendChild(faderContainer);
                ch.appendChild(db);
                ch.appendChild(panContainer);
                ch.appendChild(btnsDiv);

                container.appendChild(ch);
            }

            // Master channel
            const master = el('div', { className: 'mixer-channel master' });
            const masterName = el('div', { className: 'mixer-channel-name', text: 'MASTER' });
            masterName.style.color = '#ff6b35';
            const masterVuContainer = el('div', { className: 'mixer-vu' });
            const masterVuFill = el('div', { className: 'mixer-vu-fill' });
            masterVuFill.style.height = '0%';
            masterVuContainer.appendChild(masterVuFill);
            this.mixerVUs.push(masterVuFill);

            const masterFaderContainer = el('div', { className: 'mixer-fader-container' });
            const masterFader = el('input', { type: 'range', className: 'mixer-fader', min: '0', max: '100', value: '80' });
            masterFader.id = 'master-fader';
            masterFaderContainer.appendChild(masterFader);
            const masterDb = el('div', { className: 'mixer-db', text: '0.0dB' });

            master.appendChild(masterName);
            master.appendChild(masterVuContainer);
            master.appendChild(masterFaderContainer);
            master.appendChild(masterDb);

            container.appendChild(master);
        }

        buildPianoKeys() {
            const container = document.getElementById('piano-keys');
            while (container.firstChild) container.removeChild(container.firstChild);

            // 24 keys (2 octaves displayed)
            for (let i = 23; i >= 0; i--) {
                const noteIdx = i % 12;
                const octave = Math.floor(i / 12) + this.pianoRollOctave;
                const isBlack = BLACK_KEYS.includes(noteIdx);
                const key = el('div', {
                    className: 'piano-key ' + (isBlack ? 'black' : 'white') + (noteIdx === 0 ? ' c-note' : ''),
                    text: NOTE_NAMES[noteIdx] + octave
                });
                key.dataset.note = (octave + 1) * 12 + noteIdx;
                container.appendChild(key);
            }

            // Velocity lane label
            const velLabel = el('div', { className: 'piano-key vel-label', text: 'VEL' });
            container.appendChild(velLabel);
        }

        initPianoCanvas() {
            this.pianoCanvas = document.getElementById('pianoroll-canvas');
            if (this.pianoCanvas) {
                this.pianoCtx = this.pianoCanvas.getContext('2d');
                this.drawPianoRoll();
            }
        }

        initAutomationCanvas() {
            this.automationCanvas = document.getElementById('automation-canvas');
            if (this.automationCanvas) {
                this.automationCtx = this.automationCanvas.getContext('2d');
                this.drawAutomation();
            }
        }

        buildSynthEditorUI() {
            const btnContainer = document.getElementById('synth-channel-btns');
            if (!btnContainer) return;
            while (btnContainer.firstChild) btnContainer.removeChild(btnContainer.firstChild);

            for (let i = 0; i < CHANNELS.length; i++) {
                const btn = el('button', { className: 'synth-ch-btn' + (i === this.synthEditorChannel ? ' active' : ''), text: CHANNELS[i].name });
                btn.dataset.channel = i;
                btn.style.borderColor = (i === this.synthEditorChannel) ? CHANNELS[i].color : '';
                btnContainer.appendChild(btn);
            }

            this.updateSynthParams();
        }

        updateSynthParams() {
            const container = document.getElementById('synth-params');
            if (!container) return;
            while (container.firstChild) container.removeChild(container.firstChild);

            const ch = this.synthEditorChannel;
            const params = this.audio.channelParams[ch];

            if (CHANNELS[ch].type === 'drum') {
                // Drum params: tune, decay, tone, drive
                container.appendChild(this.createParamSlider('TUNE', 'tune', params.tune, -24, 24, 1, v => v + ' st'));
                container.appendChild(this.createParamSlider('DECAY', 'decay', params.decay, 0, 100, 1, v => v + '%'));
                container.appendChild(this.createParamSlider('TONE', 'tone', params.tone, 0, 100, 1, v => v + '%'));
                container.appendChild(this.createParamSlider('DRIVE', 'drive', params.drive, 0, 100, 1, v => v + '%'));
            } else {
                // Synth params: waveform, attack, decay, cutoff, resonance, detune
                const waveGroup = el('div', { className: 'synth-param-group' });
                const waveLabel = el('label', { text: 'WAVEFORM' });
                const waveSelect = el('select', { className: 'synth-select' });
                waveSelect.dataset.param = 'waveform';
                ['sine', 'sawtooth', 'square', 'triangle'].forEach(w => {
                    const opt = el('option', { value: w, text: w.charAt(0).toUpperCase() + w.slice(1) });
                    if (params.waveform === w) opt.selected = true;
                    waveSelect.appendChild(opt);
                });
                waveGroup.appendChild(waveLabel);
                waveGroup.appendChild(waveSelect);
                container.appendChild(waveGroup);

                container.appendChild(this.createParamSlider('ATTACK', 'attack', params.attack, 0, 100, 1, v => v + '%'));
                container.appendChild(this.createParamSlider('DECAY', 'decay', params.decay, 0, 100, 1, v => v + '%'));
                container.appendChild(this.createParamSlider('CUTOFF', 'cutoff', params.cutoff, 0, 100, 1, v => v + '%'));
                container.appendChild(this.createParamSlider('RESONANCE', 'resonance', params.resonance, 0, 30, 0.5, v => v.toFixed(1)));
                container.appendChild(this.createParamSlider('DETUNE', 'detune', params.detune, 0, 50, 1, v => v + 'ct'));
            }
        }

        createParamSlider(label, paramName, value, min, max, step, formatFn) {
            const group = el('div', { className: 'synth-param-group' });
            const lbl = el('label', { text: label });
            const input = el('input', { type: 'range', className: 'synth-range', min: String(min), max: String(max), value: String(value), step: String(step) });
            input.dataset.param = paramName;
            const valSpan = el('span', { className: 'param-val', text: formatFn(value) });
            group.appendChild(lbl);
            group.appendChild(input);
            group.appendChild(valSpan);
            return group;
        }

        buildSongChainUI() {
            this.updateSongChainDisplay();
        }

        updateSongChainDisplay() {
            const container = document.getElementById('song-chain');
            if (!container) return;
            while (container.firstChild) container.removeChild(container.firstChild);
            this.songSlotElements = [];

            const chain = this.state.songChain;
            for (let i = 0; i < chain.length; i++) {
                const slot = el('div', { className: 'song-slot', text: String(chain[i] + 1) });
                slot.dataset.index = i;
                if (this.playing && this.playMode === 'song' && i === this.songChainIndex) {
                    slot.classList.add('playing');
                }
                this.songSlotElements.push(slot);
                container.appendChild(slot);
            }

            const info = document.getElementById('song-info');
            if (info) info.textContent = chain.length + ' patterns in chain';
        }

        // ---- Event Binding ----
        bindEvents() {
            // Transport
            document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
            document.getElementById('btn-stop').addEventListener('click', () => this.stop());
            document.getElementById('btn-record').addEventListener('click', () => this.toggleRecord());

            // Metronome
            document.getElementById('btn-metronome').addEventListener('click', () => {
                this.metronome.enabled = !this.metronome.enabled;
                document.getElementById('btn-metronome').classList.toggle('active', this.metronome.enabled);
                this.setStatus('Metronome ' + (this.metronome.enabled ? 'ON' : 'OFF'));
            });

            // BPM
            document.getElementById('bpm').addEventListener('change', (e) => {
                this.bpm = Math.max(60, Math.min(200, parseInt(e.target.value) || 128));
                e.target.value = this.bpm;
                this.autoSave();
            });

            // Swing
            document.getElementById('swing').addEventListener('input', (e) => {
                this.swing = parseInt(e.target.value);
                document.getElementById('swing-val').textContent = this.swing + '%';
            });

            // Steps selector
            document.getElementById('steps-select').addEventListener('change', (e) => {
                const newLen = parseInt(e.target.value);
                this.state.pushUndo();
                this.state.setPatternLength(newLen);
                this.buildStepIndicators();
                this.buildSequencerGrid();
                this.drawPianoRoll();
                this.drawAutomation();
                this.autoSave();
                this.setStatus('Pattern length: ' + newLen + ' steps');
            });

            // Tap tempo
            document.getElementById('btn-tap').addEventListener('click', () => this.tapTempo());

            // Mode buttons
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.playMode = btn.dataset.mode;
                    this.songChainIndex = 0;
                    this.setStatus('Mode: ' + (this.playMode === 'pattern' ? 'Pattern' : 'Song'));
                });
            });

            // Pattern buttons
            document.querySelectorAll('.pattern-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.state.currentPattern = parseInt(btn.dataset.pattern);
                    this.syncStepsDropdown();
                    this.buildStepIndicators();
                    this.buildSequencerGrid();
                    this.drawPianoRoll();
                    this.drawAutomation();
                });
            });

            // Pattern tools
            document.getElementById('btn-pat-copy').addEventListener('click', () => {
                this.state.copyPattern();
                this.setStatus('Pattern copied');
            });
            document.getElementById('btn-pat-paste').addEventListener('click', () => {
                if (this.state.pastePattern()) {
                    this.syncStepsDropdown();
                    this.buildStepIndicators();
                    this.buildSequencerGrid();
                    this.drawPianoRoll();
                    this.drawAutomation();
                    this.autoSave();
                    this.setStatus('Pattern pasted');
                }
            });
            document.getElementById('btn-pat-clear').addEventListener('click', () => {
                this.state.clearPattern();
                this.buildSequencerGrid();
                this.drawPianoRoll();
                this.drawAutomation();
                this.autoSave();
                this.setStatus('Pattern cleared');
            });

            // Presets
            document.getElementById('preset-select').addEventListener('change', (e) => {
                if (e.target.value) {
                    this.loadPreset(e.target.value);
                }
            });

            // Save/Load
            document.getElementById('btn-save').addEventListener('click', () => this.saveProject());
            document.getElementById('btn-load').addEventListener('click', () => this.loadProject());
            document.getElementById('btn-json-export').addEventListener('click', () => this.exportJSON());
            document.getElementById('json-import').addEventListener('change', (e) => this.importJSON(e));

            // WAV export
            const btnExport = document.getElementById('btn-export');
            if (btnExport) {
                btnExport.addEventListener('click', () => this.setStatus('WAV export not yet implemented'));
            }

            // Tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.activeTab = tab.dataset.tab;
                    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                    const panel = document.getElementById('panel-' + tab.dataset.tab);
                    if (panel) panel.classList.add('active');
                    if (tab.dataset.tab === 'pianoroll') this.drawPianoRoll();
                    if (tab.dataset.tab === 'automation') this.drawAutomation();
                });
            });

            // Sequencer grid clicks (delegation)
            document.querySelector('.sequencer-grid').addEventListener('click', (e) => {
                const stepEl = e.target.closest('.seq-step');
                if (stepEl) {
                    const ch = parseInt(stepEl.dataset.channel);
                    const s = parseInt(stepEl.dataset.step);
                    // Shift+click on hihat = toggle open
                    if (e.shiftKey && ch === 2) {
                        const stepData = this.state.getStep(ch, s);
                        if (stepData.on) {
                            stepData.open = !stepData.open;
                            this.updateStepDisplay(ch, s);
                            this.autoSave();
                        }
                        return;
                    }
                    this.state.pushUndo();
                    const stepData = this.state.getStep(ch, s);
                    stepData.on = !stepData.on;
                    this.updateStepDisplay(ch, s);
                    this.autoSave();
                    return;
                }

                const muteBtn = e.target.closest('.seq-mute');
                if (muteBtn) {
                    const ch = parseInt(muteBtn.dataset.channel);
                    this.audio.channelMuted[ch] = !this.audio.channelMuted[ch];
                    muteBtn.classList.toggle('active');
                    return;
                }

                const soloBtn = e.target.closest('.seq-solo');
                if (soloBtn) {
                    const ch = parseInt(soloBtn.dataset.channel);
                    this.audio.channelSolo[ch] = !this.audio.channelSolo[ch];
                    soloBtn.classList.toggle('active');
                    return;
                }
            });

            // Sequencer right-click for velocity
            document.querySelector('.sequencer-grid').addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const stepEl = e.target.closest('.seq-step');
                if (!stepEl) return;
                const ch = parseInt(stepEl.dataset.channel);
                const s = parseInt(stepEl.dataset.step);
                const stepData = this.state.getStep(ch, s);
                if (!stepData.on) return;
                // Cycle velocity: 0.25 -> 0.5 -> 0.75 -> 1.0 -> 0.25
                const vels = [0.25, 0.5, 0.75, 1.0];
                const currIdx = vels.findIndex(v => Math.abs(v - stepData.velocity) < 0.1);
                stepData.velocity = vels[(currIdx + 1) % vels.length];
                this.updateStepDisplay(ch, s);
                this.autoSave();
            });

            // Mixer events (delegation)
            const mixerContainer = document.getElementById('mixer-channels');
            mixerContainer.addEventListener('input', (e) => {
                if (e.target.classList.contains('mixer-fader')) {
                    if (e.target.id === 'master-fader') {
                        const val = parseInt(e.target.value) / 100;
                        this.audio.setMasterVolume(val);
                        const dbEl = e.target.closest('.mixer-channel').querySelector('.mixer-db');
                        if (dbEl) dbEl.textContent = (val > 0 ? (20 * Math.log10(val)).toFixed(1) : '-inf') + 'dB';
                    } else {
                        const ch = parseInt(e.target.dataset.channel);
                        const val = parseInt(e.target.value) / 100;
                        if (this.audio.channelGains[ch]) {
                            this.audio.channelGains[ch].gain.value = val;
                        }
                        const dbEl = e.target.closest('.mixer-channel').querySelector('.mixer-db');
                        if (dbEl) dbEl.textContent = (val > 0 ? (20 * Math.log10(val)).toFixed(1) : '-inf') + 'dB';
                    }
                }
                if (e.target.classList.contains('mixer-pan')) {
                    const ch = parseInt(e.target.dataset.channel);
                    const val = parseInt(e.target.value) / 100;
                    if (this.audio.channelPans[ch]) {
                        this.audio.channelPans[ch].pan.value = val;
                    }
                }
            });
            mixerContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('mixer-mute')) {
                    const ch = parseInt(e.target.dataset.channel);
                    this.audio.channelMuted[ch] = !this.audio.channelMuted[ch];
                    e.target.classList.toggle('active');
                    // Sync sequencer mute buttons
                    const seqMutes = document.querySelectorAll('.seq-mute[data-channel="' + ch + '"]');
                    seqMutes.forEach(b => b.classList.toggle('active', this.audio.channelMuted[ch]));
                }
                if (e.target.classList.contains('mixer-solo')) {
                    const ch = parseInt(e.target.dataset.channel);
                    this.audio.channelSolo[ch] = !this.audio.channelSolo[ch];
                    e.target.classList.toggle('active');
                    const seqSolos = document.querySelectorAll('.seq-solo[data-channel="' + ch + '"]');
                    seqSolos.forEach(b => b.classList.toggle('active', this.audio.channelSolo[ch]));
                }
            });

            // Effects
            this.bindEffect('fx-reverb', v => this.audio.setReverbMix(v / 100), v => v + '%');
            this.bindEffect('fx-delay', v => this.audio.setDelayMix(v / 100), v => v + '%');
            this.bindEffect('fx-delay-time', v => {
                const stepSec = 60 / this.bpm / 4;
                this.audio.setDelayTime(stepSec * v);
            }, v => '1/' + v);
            this.bindEffect('fx-filter', v => this.audio.setFilterFreq(v), v => {
                return v >= 1000 ? (v / 1000).toFixed(1) + 'kHz' : v + 'Hz';
            });
            this.bindEffect('fx-resonance', v => this.audio.setFilterQ(v), v => v.toFixed(1));
            this.bindEffect('fx-distortion', v => this.audio.setDistortion(v / 100), v => v + '%');
            this.bindEffect('fx-compressor', v => this.audio.setCompressor(v / 100), v => v + '%');
            this.bindEffect('fx-master', v => this.audio.setMasterVolume(v / 100), v => v + '%');

            // Synth editor channel buttons (delegation)
            const synthBtns = document.getElementById('synth-channel-btns');
            if (synthBtns) {
                synthBtns.addEventListener('click', (e) => {
                    const btn = e.target.closest('.synth-ch-btn');
                    if (!btn) return;
                    this.synthEditorChannel = parseInt(btn.dataset.channel);
                    synthBtns.querySelectorAll('.synth-ch-btn').forEach((b, i) => {
                        b.classList.toggle('active', i === this.synthEditorChannel);
                        b.style.borderColor = (i === this.synthEditorChannel) ? CHANNELS[i].color : '';
                    });
                    this.updateSynthParams();
                });
            }

            // Synth params changes (delegation)
            const synthParams = document.getElementById('synth-params');
            if (synthParams) {
                synthParams.addEventListener('input', (e) => {
                    const paramName = e.target.dataset.param;
                    if (!paramName) return;
                    const ch = this.synthEditorChannel;
                    const params = this.audio.channelParams[ch];
                    if (e.target.tagName === 'SELECT') {
                        params[paramName] = e.target.value;
                    } else {
                        params[paramName] = parseFloat(e.target.value);
                        const valSpan = e.target.parentElement.querySelector('.param-val');
                        if (valSpan) {
                            if (paramName === 'tune') valSpan.textContent = params[paramName] + ' st';
                            else if (paramName === 'resonance') valSpan.textContent = params[paramName].toFixed(1);
                            else if (paramName === 'detune') valSpan.textContent = params[paramName] + 'ct';
                            else valSpan.textContent = params[paramName] + '%';
                        }
                    }
                    this.autoSave();
                });
            }

            // Sidechain controls
            const scAmount = document.getElementById('sc-amount');
            if (scAmount) {
                scAmount.addEventListener('input', (e) => {
                    this.audio.sidechainAmount = parseInt(e.target.value) / 100;
                    document.getElementById('sc-amount-val').textContent = e.target.value + '%';
                });
            }
            const scRelease = document.getElementById('sc-release');
            if (scRelease) {
                scRelease.addEventListener('input', (e) => {
                    this.audio.sidechainRelease = parseInt(e.target.value);
                    document.getElementById('sc-release-val').textContent = e.target.value + 'ms';
                });
            }

            // Song mode buttons
            document.getElementById('btn-song-add').addEventListener('click', () => {
                this.state.songChain.push(0);
                this.updateSongChainDisplay();
                this.autoSave();
            });
            document.getElementById('btn-song-remove').addEventListener('click', () => {
                if (this.state.songChain.length > 0) {
                    this.state.songChain.pop();
                    this.updateSongChainDisplay();
                    this.autoSave();
                }
            });
            document.getElementById('btn-song-clear').addEventListener('click', () => {
                this.state.songChain = [];
                this.songChainIndex = 0;
                this.updateSongChainDisplay();
                this.autoSave();
            });
            document.getElementById('song-loop').addEventListener('change', (e) => {
                this.songLoop = e.target.checked;
            });

            // Song chain slot clicks (delegation)
            document.getElementById('song-chain').addEventListener('click', (e) => {
                const slot = e.target.closest('.song-slot');
                if (!slot) return;
                const idx = parseInt(slot.dataset.index);
                // Cycle 0-7
                this.state.songChain[idx] = (this.state.songChain[idx] + 1) % NUM_PATTERNS;
                slot.textContent = String(this.state.songChain[idx] + 1);
                this.autoSave();
            });

            // Piano roll events
            const prChannel = document.getElementById('pianoroll-channel');
            if (prChannel) {
                prChannel.addEventListener('change', (e) => {
                    this.pianoRollChannel = parseInt(e.target.value);
                    this.drawPianoRoll();
                });
            }
            document.getElementById('octave-down').addEventListener('click', () => {
                if (this.pianoRollOctave > 1) {
                    this.pianoRollOctave--;
                    document.getElementById('octave-display').textContent = this.pianoRollOctave;
                    this.buildPianoKeys();
                    this.drawPianoRoll();
                }
            });
            document.getElementById('octave-up').addEventListener('click', () => {
                if (this.pianoRollOctave < 7) {
                    this.pianoRollOctave++;
                    document.getElementById('octave-display').textContent = this.pianoRollOctave;
                    this.buildPianoKeys();
                    this.drawPianoRoll();
                }
            });
            document.getElementById('clear-notes').addEventListener('click', () => {
                this.state.pushUndo();
                const channels = this.state.getCurrentPatternChannels();
                const steps = this.state.getSteps();
                for (let s = 0; s < steps; s++) {
                    channels[this.pianoRollChannel][s].on = false;
                    channels[this.pianoRollChannel][s].velocity = 0.8;
                    channels[this.pianoRollChannel][s].note = 48;
                    channels[this.pianoRollChannel][s].duration = 1;
                }
                this.updateSequencerDisplay();
                this.drawPianoRoll();
                this.autoSave();
            });

            // Piano roll canvas mouse events for note duration drag and velocity editing
            if (this.pianoCanvas) {
                this.pianoCanvas.addEventListener('mousedown', (e) => this.handlePianoRollMouseDown(e));
                this.pianoCanvas.addEventListener('mousemove', (e) => this.handlePianoRollMouseMove(e));
                this.pianoCanvas.addEventListener('mouseup', (e) => this.handlePianoRollMouseUp(e));
                this.pianoCanvas.addEventListener('mouseleave', (e) => this.handlePianoRollMouseUp(e));
                this.pianoCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
            }

            // Automation events
            const autoParamSelect = document.getElementById('automation-param-select');
            if (autoParamSelect) {
                autoParamSelect.addEventListener('change', (e) => {
                    this.automationParam = e.target.value;
                    this.drawAutomation();
                });
            }
            const autoClear = document.getElementById('automation-clear');
            if (autoClear) {
                autoClear.addEventListener('click', () => {
                    this.state.pushUndo();
                    const pat = this.state.getCurrentPattern();
                    if (pat.automation[this.automationParam]) {
                        delete pat.automation[this.automationParam];
                    }
                    this.drawAutomation();
                    this.autoSave();
                    this.setStatus('Automation lane cleared');
                });
            }

            if (this.automationCanvas) {
                this.automationCanvas.addEventListener('mousedown', (e) => this.handleAutomationMouseDown(e));
                this.automationCanvas.addEventListener('mousemove', (e) => this.handleAutomationMouseMove(e));
                this.automationCanvas.addEventListener('mouseup', () => { this.automationDragging = false; });
                this.automationCanvas.addEventListener('mouseleave', () => { this.automationDragging = false; });
                this.automationCanvas.addEventListener('contextmenu', (e) => this.handleAutomationRightClick(e));
            }

            // Keyboard events
            document.addEventListener('keydown', (e) => this.handleKeyDown(e));
            document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        }

        bindEffect(id, setter, formatter) {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                setter(val);
                const valEl = document.getElementById(id + '-val');
                if (valEl) valEl.textContent = formatter(val);
            });
        }

        // ---- Keyboard Handling ----
        handleKeyDown(e) {
            // Avoid input fields
            if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
            if (e.target.tagName === 'SELECT') return;

            // Ctrl+Z: undo
            if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
                e.preventDefault();
                if (this.state.undo()) {
                    this.syncStepsDropdown();
                    this.buildStepIndicators();
                    this.buildSequencerGrid();
                    this.drawPianoRoll();
                    this.drawAutomation();
                    this.flashUndo();
                    this.setStatus('Undo');
                    this.autoSave();
                }
                return;
            }

            // Ctrl+Shift+Z: redo
            if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                if (this.state.redo()) {
                    this.syncStepsDropdown();
                    this.buildStepIndicators();
                    this.buildSequencerGrid();
                    this.drawPianoRoll();
                    this.drawAutomation();
                    this.setStatus('Redo');
                    this.autoSave();
                }
                return;
            }

            // Ctrl+S: save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveProject();
                return;
            }

            // Ctrl+C: copy pattern
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                this.state.copyPattern();
                this.setStatus('Pattern copied');
                return;
            }

            // Ctrl+V: paste pattern
            if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                if (this.state.pastePattern()) {
                    this.syncStepsDropdown();
                    this.buildStepIndicators();
                    this.buildSequencerGrid();
                    this.drawPianoRoll();
                    this.drawAutomation();
                    this.autoSave();
                    this.setStatus('Pattern pasted');
                }
                return;
            }

            // Space: toggle play
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePlay();
                return;
            }

            // T: tap tempo
            if (e.key === 't' || e.key === 'T') {
                if (!e.ctrlKey) {
                    this.tapTempo();
                    return;
                }
            }

            // QWERTY piano (only on piano roll tab)
            if (this.activeTab === 'pianoroll') {
                const key = e.key.toLowerCase();
                if (PIANO_KEYS.hasOwnProperty(key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    const semitone = PIANO_KEYS[key];
                    const octaveOffset = e.shiftKey ? 1 : 0;
                    const midiNote = (this.pianoRollOctave + 1 + octaveOffset) * 12 + semitone;
                    this.audio.previewNote(this.pianoRollChannel, midiNote);

                    // If playing and recording, insert note at current step
                    if (this.playing && this.recording && this.currentStep >= 0) {
                        const channels = this.state.getCurrentPatternChannels();
                        const stepData = channels[this.pianoRollChannel][this.currentStep];
                        stepData.on = true;
                        stepData.note = midiNote;
                        this.updateStepDisplay(this.pianoRollChannel, this.currentStep);
                        this.drawPianoRoll();
                        this.autoSave();
                    }
                }
            }

            // Number keys 1-8: pattern select
            if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key >= '1' && e.key <= '8') {
                const patIdx = parseInt(e.key) - 1;
                this.state.currentPattern = patIdx;
                document.querySelectorAll('.pattern-btn').forEach((b, i) => b.classList.toggle('active', i === patIdx));
                this.syncStepsDropdown();
                this.buildStepIndicators();
                this.buildSequencerGrid();
                this.drawPianoRoll();
                this.drawAutomation();
            }
        }

        handleKeyUp(e) {
            // Nothing needed for now
        }

        // ---- Tap Tempo ----
        tapTempo() {
            const now = performance.now();
            this.tapTimes.push(now);
            if (this.tapTimes.length > 4) {
                this.tapTimes.shift();
            }

            // Flash button
            const tapBtn = document.getElementById('btn-tap');
            tapBtn.classList.add('active');
            setTimeout(() => tapBtn.classList.remove('active'), 100);

            if (this.tapTimes.length >= 2) {
                let totalInterval = 0;
                for (let i = 1; i < this.tapTimes.length; i++) {
                    totalInterval += this.tapTimes[i] - this.tapTimes[i - 1];
                }
                const avgInterval = totalInterval / (this.tapTimes.length - 1);
                const newBpm = Math.round(60000 / avgInterval);
                if (newBpm >= 60 && newBpm <= 200) {
                    this.bpm = newBpm;
                    document.getElementById('bpm').value = this.bpm;
                    this.setStatus('Tap BPM: ' + this.bpm);
                }
            }

            // Reset if too long between taps
            if (this.tapTimes.length >= 2) {
                const last = this.tapTimes[this.tapTimes.length - 1];
                const prev = this.tapTimes[this.tapTimes.length - 2];
                if (last - prev > 2000) {
                    this.tapTimes = [now];
                }
            }
        }

        // ---- Transport ----
        async togglePlay() {
            await this.audio.init();
            if (this.playing) {
                this.stop();
            } else {
                this.play();
            }
        }

        play() {
            if (this.playing) return;
            this.playing = true;
            this.currentStep = -1;
            this.nextStepTime = this.audio.ctx.currentTime;
            this.songChainIndex = 0;

            // If song mode, load first pattern in chain
            if (this.playMode === 'song' && this.state.songChain.length > 0) {
                this.state.currentPattern = this.state.songChain[0];
                this.updatePatternButtons();
            }

            this.scheduler();
            document.getElementById('btn-play').classList.add('active');
            this.setStatus('Playing - ' + this.bpm + ' BPM');
        }

        stop() {
            this.playing = false;
            this.recording = false;
            if (this.schedulerTimer) {
                clearTimeout(this.schedulerTimer);
                this.schedulerTimer = null;
            }
            // Clear step highlights
            this.clearPlayingIndicators();
            this.currentStep = -1;
            document.getElementById('btn-play').classList.remove('active');
            document.getElementById('btn-record').classList.remove('active');
            this.setStatus('Stopped');
        }

        toggleRecord() {
            this.recording = !this.recording;
            document.getElementById('btn-record').classList.toggle('active', this.recording);
            this.setStatus(this.recording ? 'Recording armed' : 'Recording off');
        }

        scheduler() {
            if (!this.playing) return;
            const steps = this.state.getSteps();

            while (this.nextStepTime < this.audio.ctx.currentTime + this.scheduleAheadTime) {
                this.currentStep = (this.currentStep + 1) % steps;

                // Calculate swing
                const swingOffset = (this.currentStep % 2 === 1) ? (this.swing / 100) * (60 / this.bpm / 4) : 0;
                const stepTime = this.nextStepTime + swingOffset;

                // Play current step
                this.playStep(this.currentStep, stepTime);

                // Schedule UI update
                const uiStep = this.currentStep;
                const uiDelay = Math.max(0, (stepTime - this.audio.ctx.currentTime) * 1000);
                setTimeout(() => this.updatePlayingStep(uiStep), uiDelay);

                // Advance time
                const stepDuration = 60 / this.bpm / 4;
                this.nextStepTime += stepDuration;

                // Check if we wrapped and need to advance song
                if (this.currentStep === steps - 1 && this.playMode === 'song' && this.state.songChain.length > 0) {
                    this.songChainIndex++;
                    if (this.songChainIndex >= this.state.songChain.length) {
                        if (this.songLoop) {
                            this.songChainIndex = 0;
                        } else {
                            // Stop after this pattern finishes
                            setTimeout(() => this.stop(), (this.nextStepTime - this.audio.ctx.currentTime) * 1000);
                        }
                    }
                    if (this.songChainIndex < this.state.songChain.length) {
                        this.state.currentPattern = this.state.songChain[this.songChainIndex];
                        setTimeout(() => {
                            this.updatePatternButtons();
                            this.syncStepsDropdown();
                            this.buildStepIndicators();
                            this.buildSequencerGrid();
                            this.updateSongChainDisplay();
                        }, uiDelay);
                    }
                }
            }

            this.schedulerTimer = setTimeout(() => this.scheduler(), this.lookAhead);
        }

        playStep(step, time) {
            const pat = this.state.getCurrentPattern();
            const channels = pat.channels;
            const stepDurationSec = 60 / this.bpm / 4;

            // Apply automation BEFORE playing audio
            this.applyAutomation(pat, step, time);

            // Metronome click
            if (this.metronome.enabled) {
                const beatsPerPattern = Math.max(4, pat.stepsCount / 4);
                if (step % 4 === 0) {
                    this.audio.playClick(time, step === 0);
                }
            }

            for (let ch = 0; ch < CHANNELS.length; ch++) {
                const stepData = channels[ch][step];
                if (stepData.on) {
                    const isOpen = (ch === 2) ? stepData.open : false;
                    const noteLength = (stepData.duration || 1) * stepDurationSec;
                    this.audio.playChannel(ch, time, stepData.velocity, stepData.note, isOpen, noteLength);
                }
            }
        }

        // ---- Automation Playback ----
        applyAutomation(pat, step, time) {
            if (!pat.automation || !this.audio.ctx) return;
            const stepDuration = 60 / this.bpm / 4;

            for (const [paramKey, values] of Object.entries(pat.automation)) {
                if (!values || values[step] === null || values[step] === undefined) continue;
                const val = values[step]; // 0.0-1.0 normalized

                // Find next non-null value for interpolation
                let nextVal = val;
                let stepsToNext = 1;
                for (let i = 1; i < pat.stepsCount; i++) {
                    const nextStep = (step + i) % pat.stepsCount;
                    if (values[nextStep] !== null && values[nextStep] !== undefined) {
                        nextVal = values[nextStep];
                        stepsToNext = i;
                        break;
                    }
                }
                const rampTime = stepsToNext * stepDuration;

                if (paramKey === 'master-filter') {
                    // Map 0-1 to 100-20000Hz (logarithmic)
                    const freq = 100 * Math.pow(200, val);
                    const nextFreq = 100 * Math.pow(200, nextVal);
                    this.audio.filterNode.frequency.setValueAtTime(freq, time);
                    this.audio.filterNode.frequency.linearRampToValueAtTime(nextFreq, time + rampTime);
                } else if (paramKey === 'master-resonance') {
                    const q = val * 30;
                    this.audio.filterNode.Q.setValueAtTime(q, time);
                } else if (paramKey === 'master-reverb') {
                    this.audio.reverbGain.gain.setValueAtTime(val, time);
                } else if (paramKey === 'master-delay') {
                    this.audio.delayGain.gain.setValueAtTime(val, time);
                } else if (paramKey === 'master-distortion') {
                    // Can't automate WaveShaper curve smoothly, just set it
                    this.audio.distortionNode.curve = this.audio.makeDistortionCurve(val);
                } else if (paramKey.startsWith('channel-')) {
                    const parts = paramKey.split('-');
                    const chIdx = parseInt(parts[1]);
                    const paramType = parts[2];
                    if (paramType === 'volume' && this.audio.channelGains[chIdx]) {
                        const mappedVal = val; // 0-1
                        this.audio.channelGains[chIdx].gain.setValueAtTime(mappedVal, time);
                        this.audio.channelGains[chIdx].gain.linearRampToValueAtTime(
                            nextVal, time + rampTime
                        );
                    }
                    // cutoff automation for synth channels would require per-note filter,
                    // which is complex; we update the channel param instead for next note
                    if (paramType === 'cutoff') {
                        this.audio.channelParams[chIdx].cutoff = val * 100;
                    }
                }
            }
        }

        updatePlayingStep(step) {
            // Clear previous
            this.clearPlayingIndicators();

            // Highlight step indicators
            if (this.stepIndicators[step]) {
                this.stepIndicators[step].classList.add('active');
            }

            // Highlight sequencer steps
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                if (this.stepElements[ch] && this.stepElements[ch][step]) {
                    this.stepElements[ch][step].classList.add('playing');
                }
            }

            // Update status
            if (this.playing) {
                const beat = Math.floor(step / 4) + 1;
                const subBeat = (step % 4) + 1;
                document.getElementById('status-center').textContent = 'Bar 1.' + beat + '.' + subBeat + ' | Pattern ' + (this.state.currentPattern + 1);
            }
        }

        clearPlayingIndicators() {
            this.stepIndicators.forEach(ind => ind.classList.remove('active'));
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                if (this.stepElements[ch]) {
                    this.stepElements[ch].forEach(s => s.classList.remove('playing'));
                }
            }
        }

        updatePatternButtons() {
            document.querySelectorAll('.pattern-btn').forEach((b, i) => {
                b.classList.toggle('active', i === this.state.currentPattern);
            });
        }

        // ---- Display Updates ----
        updateSequencerDisplay() {
            const steps = this.state.getSteps();
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                for (let s = 0; s < steps; s++) {
                    this.updateStepDisplay(ch, s);
                }
            }
        }

        updateStepDisplay(ch, s) {
            const stepEl = this.stepElements[ch] ? this.stepElements[ch][s] : null;
            if (!stepEl) return;
            const stepData = this.state.getStep(ch, s);

            stepEl.classList.toggle('on', stepData.on);
            stepEl.classList.toggle('open-hat', ch === 2 && stepData.on && stepData.open);

            // Show note name for synth channels
            if (CHANNELS[ch].type === 'synth' && stepData.on) {
                stepEl.classList.add('synth-note');
                // Remove old text nodes (except fill and velocity-bar)
                const existing = stepEl.querySelector('.note-label');
                if (existing) existing.remove();
                const noteLabel = el('span', { className: 'note-label', text: midiNoteName(stepData.note) });
                noteLabel.style.position = 'absolute';
                noteLabel.style.top = '2px';
                noteLabel.style.left = '0';
                noteLabel.style.right = '0';
                noteLabel.style.textAlign = 'center';
                noteLabel.style.fontSize = '8px';
                noteLabel.style.color = 'rgba(255,255,255,0.7)';
                noteLabel.style.pointerEvents = 'none';
                noteLabel.style.zIndex = '2';
                stepEl.appendChild(noteLabel);
            } else {
                stepEl.classList.remove('synth-note');
                const existing = stepEl.querySelector('.note-label');
                if (existing) existing.remove();
            }

            // Velocity bar
            const velBar = stepEl.querySelector('.velocity-bar');
            if (velBar) {
                velBar.style.height = stepData.on ? (stepData.velocity * 100) + '%' : '0%';
            }

            // Fill visibility
            const fill = stepEl.querySelector('.step-fill');
            if (fill) {
                fill.style.display = stepData.on ? 'block' : 'none';
            }
        }

        flashUndo() {
            const grid = document.querySelector('.sequencer-grid');
            grid.classList.add('undo-flash');
            setTimeout(() => grid.classList.remove('undo-flash'), 300);
        }

        // ---- Piano Roll ----
        drawPianoRoll() {
            if (!this.pianoCtx || !this.pianoCanvas) return;
            const ctx = this.pianoCtx;
            const w = this.pianoCanvas.width;
            const h = this.pianoCanvas.height;
            const noteAreaH = 480;
            const velAreaH = h - noteAreaH; // 60px
            const rows = 24; // 2 octaves
            const rowH = noteAreaH / rows;
            const steps = this.state.getSteps();
            const colW = w / steps;

            ctx.clearRect(0, 0, w, h);

            // Background
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, w, h);

            // Grid rows
            for (let i = 0; i < rows; i++) {
                const noteIdx = (23 - i) % 12;
                const isBlack = BLACK_KEYS.includes(noteIdx);
                ctx.fillStyle = isBlack ? '#111122' : '#151528';
                ctx.fillRect(0, i * rowH, w, rowH);

                if (noteIdx === 0) {
                    ctx.strokeStyle = '#333355';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(0, i * rowH);
                    ctx.lineTo(w, i * rowH);
                    ctx.stroke();
                }
            }

            // Vertical grid lines
            for (let s = 0; s <= steps; s++) {
                ctx.strokeStyle = s % 4 === 0 ? '#333355' : '#1a1a35';
                ctx.lineWidth = s % 4 === 0 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(s * colW, 0);
                ctx.lineTo(s * colW, noteAreaH);
                ctx.stroke();
            }

            // Draw notes with duration
            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const baseNote = (this.pianoRollOctave + 1) * 12;
            const color = CHANNELS[ch].color;

            for (let s = 0; s < steps; s++) {
                const stepData = channels[ch][s];
                if (stepData.on) {
                    const noteOffset = stepData.note - baseNote;
                    if (noteOffset >= 0 && noteOffset < rows) {
                        const row = rows - 1 - noteOffset;
                        const dur = stepData.duration || 1;
                        const noteW = Math.min(dur, steps - s) * colW;

                        ctx.fillStyle = color;
                        ctx.globalAlpha = 0.3 + stepData.velocity * 0.7;
                        ctx.fillRect(s * colW + 1, row * rowH + 1, noteW - 2, rowH - 2);
                        ctx.globalAlpha = 1;

                        // Border
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(s * colW + 1, row * rowH + 1, noteW - 2, rowH - 2);
                    }
                }
            }

            // Draw dragging preview
            if (this.pianoRollDragging && this.pianoRollDragStep >= 0) {
                const noteOffset = this.pianoRollDragNote - baseNote;
                if (noteOffset >= 0 && noteOffset < rows) {
                    const row = rows - 1 - noteOffset;
                    const dur = this.pianoRollDragDuration;
                    const noteW = Math.min(dur, steps - this.pianoRollDragStep) * colW;
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(this.pianoRollDragStep * colW + 1, row * rowH + 1, noteW - 2, rowH - 2);
                    ctx.globalAlpha = 1;
                }
            }

            // Separator line between notes and velocity
            ctx.strokeStyle = '#444466';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, noteAreaH);
            ctx.lineTo(w, noteAreaH);
            ctx.stroke();

            // Velocity lane background
            ctx.fillStyle = '#0a0a16';
            ctx.fillRect(0, noteAreaH, w, velAreaH);

            // Velocity lane vertical grid
            for (let s = 0; s <= steps; s++) {
                ctx.strokeStyle = s % 4 === 0 ? '#333355' : '#1a1a35';
                ctx.lineWidth = s % 4 === 0 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(s * colW, noteAreaH);
                ctx.lineTo(s * colW, h);
                ctx.stroke();
            }

            // Velocity bars
            for (let s = 0; s < steps; s++) {
                const stepData = channels[ch][s];
                if (stepData.on) {
                    const barH = stepData.velocity * (velAreaH - 5);
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.7;
                    ctx.fillRect(s * colW + 2, h - barH - 2, colW - 4, barH);
                    ctx.globalAlpha = 1;
                }
            }

            // Playhead
            if (this.playing && this.currentStep >= 0) {
                ctx.strokeStyle = '#00ff87';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.currentStep * colW, 0);
                ctx.lineTo(this.currentStep * colW, h);
                ctx.stroke();
            }
        }

        handlePianoRollMouseDown(e) {
            const rect = this.pianoCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const scaleX = this.pianoCanvas.width / rect.width;
            const scaleY = this.pianoCanvas.height / rect.height;
            const canvasX = x * scaleX;
            const canvasY = y * scaleY;

            const steps = this.state.getSteps();
            const noteAreaH = 480;
            const velAreaH = this.pianoCanvas.height - noteAreaH;
            const rows = 24;
            const rowH = noteAreaH / rows;
            const colW = this.pianoCanvas.width / steps;

            // Check if click is in velocity lane
            if (canvasY > noteAreaH) {
                this.velocityDragging = true;
                this.handleVelocityEdit(canvasX, canvasY, noteAreaH, velAreaH, colW, steps);
                return;
            }

            // Note area
            const step = Math.floor(canvasX / colW);
            const row = Math.floor(canvasY / rowH);
            const noteOffset = rows - 1 - row;
            const baseNote = (this.pianoRollOctave + 1) * 12;
            const midiNote = baseNote + noteOffset;

            if (step < 0 || step >= steps || midiNote < 0 || midiNote > 127) return;

            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const stepData = channels[ch][step];

            if (stepData.on && stepData.note === midiNote) {
                // Toggle off
                this.state.pushUndo();
                stepData.on = false;
                this.updateStepDisplay(ch, step);
                this.drawPianoRoll();
                this.autoSave();
            } else {
                // Start dragging to set note with duration
                this.state.pushUndo();
                this.pianoRollDragging = true;
                this.pianoRollDragStep = step;
                this.pianoRollDragNote = midiNote;
                this.pianoRollDragDuration = 1;
                this.audio.previewNote(ch, midiNote);
            }
        }

        handlePianoRollMouseMove(e) {
            if (this.velocityDragging) {
                const rect = this.pianoCanvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (this.pianoCanvas.width / rect.width);
                const y = (e.clientY - rect.top) * (this.pianoCanvas.height / rect.height);
                const noteAreaH = 480;
                const velAreaH = this.pianoCanvas.height - noteAreaH;
                const steps = this.state.getSteps();
                const colW = this.pianoCanvas.width / steps;
                this.handleVelocityEdit(x, y, noteAreaH, velAreaH, colW, steps);
                return;
            }

            if (!this.pianoRollDragging) return;

            const rect = this.pianoCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.pianoCanvas.width / rect.width);
            const steps = this.state.getSteps();
            const colW = this.pianoCanvas.width / steps;

            const currentCol = Math.floor(x / colW);
            const duration = Math.max(1, Math.min(currentCol - this.pianoRollDragStep + 1, steps - this.pianoRollDragStep));
            this.pianoRollDragDuration = duration;
            this.drawPianoRoll();
        }

        handlePianoRollMouseUp(e) {
            if (this.velocityDragging) {
                this.velocityDragging = false;
                this.autoSave();
                return;
            }

            if (!this.pianoRollDragging) return;
            this.pianoRollDragging = false;

            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const step = this.pianoRollDragStep;
            const steps = this.state.getSteps();

            if (step >= 0 && step < steps) {
                const stepData = channels[ch][step];
                stepData.on = true;
                stepData.note = this.pianoRollDragNote;
                stepData.velocity = 0.8;
                stepData.duration = this.pianoRollDragDuration;
                this.updateStepDisplay(ch, step);
            }

            this.pianoRollDragStep = -1;
            this.drawPianoRoll();
            this.autoSave();
        }

        handleVelocityEdit(canvasX, canvasY, noteAreaH, velAreaH, colW, steps) {
            const step = Math.floor(canvasX / colW);
            if (step < 0 || step >= steps) return;

            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const stepData = channels[ch][step];
            if (!stepData.on) return;

            // Calculate velocity from y position (bottom = 0, top of vel area = 1)
            const relY = canvasY - noteAreaH;
            const velocity = Math.max(0.05, Math.min(1, 1 - (relY / velAreaH)));
            stepData.velocity = Math.round(velocity * 100) / 100;
            this.drawPianoRoll();
        }

        // ---- Automation Drawing ----
        drawAutomation() {
            if (!this.automationCtx || !this.automationCanvas) return;
            const ctx = this.automationCtx;
            const w = this.automationCanvas.width;
            const h = this.automationCanvas.height;
            const steps = this.state.getSteps();
            const colW = w / steps;
            const pat = this.state.getCurrentPattern();

            ctx.clearRect(0, 0, w, h);

            // Background
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, w, h);

            // Grid lines
            for (let s = 0; s <= steps; s++) {
                ctx.strokeStyle = s % 4 === 0 ? '#333355' : '#1a1a35';
                ctx.lineWidth = s % 4 === 0 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(s * colW, 0);
                ctx.lineTo(s * colW, h);
                ctx.stroke();
            }

            // Horizontal guide lines
            for (let i = 0; i <= 4; i++) {
                const y = (i / 4) * h;
                ctx.strokeStyle = '#222240';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Draw automation data
            const values = pat.automation ? pat.automation[this.automationParam] : null;
            if (values) {
                // Filled area
                ctx.beginPath();
                let started = false;
                for (let s = 0; s < steps; s++) {
                    if (values[s] !== null && values[s] !== undefined) {
                        const x = s * colW + colW / 2;
                        const y = (1 - values[s]) * h;
                        if (!started) {
                            ctx.moveTo(x, h);
                            ctx.lineTo(x, y);
                            started = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                }
                if (started) {
                    // Close at bottom
                    for (let s = steps - 1; s >= 0; s--) {
                        if (values[s] !== null && values[s] !== undefined) {
                            const x = s * colW + colW / 2;
                            ctx.lineTo(x, h);
                            break;
                        }
                    }
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(255, 107, 53, 0.15)';
                    ctx.fill();
                }

                // Line
                ctx.beginPath();
                started = false;
                for (let s = 0; s < steps; s++) {
                    if (values[s] !== null && values[s] !== undefined) {
                        const x = s * colW + colW / 2;
                        const y = (1 - values[s]) * h;
                        if (!started) {
                            ctx.moveTo(x, y);
                            started = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                }
                ctx.strokeStyle = '#ff6b35';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Points
                for (let s = 0; s < steps; s++) {
                    if (values[s] !== null && values[s] !== undefined) {
                        const x = s * colW + colW / 2;
                        const y = (1 - values[s]) * h;
                        ctx.beginPath();
                        ctx.arc(x, y, 4, 0, Math.PI * 2);
                        ctx.fillStyle = '#ff6b35';
                        ctx.fill();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            }

            // Playhead
            if (this.playing && this.currentStep >= 0) {
                ctx.strokeStyle = '#00ff87';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.currentStep * colW, 0);
                ctx.lineTo(this.currentStep * colW, h);
                ctx.stroke();
            }
        }

        handleAutomationMouseDown(e) {
            if (e.button === 2) return; // Right-click handled separately
            this.automationDragging = true;
            this.setAutomationPoint(e);
        }

        handleAutomationMouseMove(e) {
            if (!this.automationDragging) return;
            this.setAutomationPoint(e);
        }

        setAutomationPoint(e) {
            const rect = this.automationCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.automationCanvas.width / rect.width);
            const y = (e.clientY - rect.top) * (this.automationCanvas.height / rect.height);
            const steps = this.state.getSteps();
            const colW = this.automationCanvas.width / steps;
            const h = this.automationCanvas.height;

            const step = Math.floor(x / colW);
            if (step < 0 || step >= steps) return;

            const value = Math.max(0, Math.min(1, 1 - y / h));

            const pat = this.state.getCurrentPattern();
            if (!pat.automation) pat.automation = {};
            if (!pat.automation[this.automationParam]) {
                pat.automation[this.automationParam] = new Array(steps).fill(null);
            }
            // Ensure array length matches
            while (pat.automation[this.automationParam].length < steps) {
                pat.automation[this.automationParam].push(null);
            }
            pat.automation[this.automationParam][step] = Math.round(value * 100) / 100;
            this.drawAutomation();
            this.autoSave();
        }

        handleAutomationRightClick(e) {
            e.preventDefault();
            const rect = this.automationCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.automationCanvas.width / rect.width);
            const steps = this.state.getSteps();
            const colW = this.automationCanvas.width / steps;
            const step = Math.floor(x / colW);
            if (step < 0 || step >= steps) return;

            const pat = this.state.getCurrentPattern();
            if (pat.automation && pat.automation[this.automationParam]) {
                pat.automation[this.automationParam][step] = null;
                this.drawAutomation();
                this.autoSave();
            }
        }

        // ---- Presets ----
        loadPreset(name) {
            const preset = PRESETS[name];
            if (!preset) return;

            this.state.pushUndo();
            this.bpm = preset.bpm;
            document.getElementById('bpm').value = this.bpm;

            // Clear current pattern (16-step default for presets)
            const pattern = this.state.createEmptyPattern(DEFAULT_STEPS);

            // Apply preset steps
            for (const [chStr, chData] of Object.entries(preset.steps)) {
                const ch = parseInt(chStr);
                if (ch < 0 || ch >= CHANNELS.length) continue;

                if (chData.on) {
                    for (let i = 0; i < chData.on.length; i++) {
                        const step = chData.on[i];
                        if (step < DEFAULT_STEPS) {
                            pattern.channels[ch][step].on = true;
                            if (chData.notes && chData.notes[i] !== undefined) {
                                pattern.channels[ch][step].note = chData.notes[i];
                            }
                            if (chData.velocity && chData.velocity[step] !== undefined) {
                                pattern.channels[ch][step].velocity = chData.velocity[step];
                            }
                        }
                    }
                }

                // Apply velocity to all 16 steps if provided as array
                if (chData.velocity) {
                    for (let s = 0; s < DEFAULT_STEPS; s++) {
                        if (chData.velocity[s] !== undefined && pattern.channels[ch][s].on) {
                            pattern.channels[ch][s].velocity = chData.velocity[s];
                        }
                    }
                }
            }

            this.state.patterns[this.state.currentPattern] = pattern;
            this.syncStepsDropdown();
            this.buildStepIndicators();
            this.buildSequencerGrid();
            this.drawPianoRoll();
            this.drawAutomation();
            this.autoSave();
            this.setStatus('Loaded preset: ' + name);
        }

        // ---- Save/Load ----
        saveProject() {
            const name = prompt('Project name:');
            if (!name) return;

            const projectData = this.serializeProject();
            const key = 'funkybeats-project-' + name.replace(/[^a-zA-Z0-9_-]/g, '_');
            try {
                localStorage.setItem(key, JSON.stringify(projectData));
                this.setStatus('Project saved: ' + name);
            } catch (e) {
                this.setStatus('Save failed: ' + e.message);
            }
        }

        loadProject() {
            // Gather saved projects
            const projects = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('funkybeats-project-')) {
                    projects.push(key.replace('funkybeats-project-', ''));
                }
            }

            if (projects.length === 0) {
                // Offer file import
                const doImport = confirm('No saved projects found. Import from JSON file?');
                if (doImport) {
                    document.getElementById('json-import').click();
                }
                return;
            }

            let msg = 'Saved projects:\n';
            projects.forEach((p, i) => {
                msg += (i + 1) + '. ' + p + '\n';
            });
            msg += '\nEnter number to load, or "import" for file import:';
            const choice = prompt(msg);
            if (!choice) return;

            if (choice.toLowerCase() === 'import') {
                document.getElementById('json-import').click();
                return;
            }

            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < projects.length) {
                const key = 'funkybeats-project-' + projects[idx];
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    this.deserializeProject(data);
                    this.setStatus('Loaded project: ' + projects[idx]);
                } catch (e) {
                    this.setStatus('Load failed: ' + e.message);
                }
            }
        }

        exportJSON() {
            const data = this.serializeProject();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = el('a', { href: url, download: 'funkybeats-project.json' });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.setStatus('JSON exported');
        }

        importJSON(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this.deserializeProject(data);
                    this.setStatus('Imported: ' + file.name);
                } catch (err) {
                    this.setStatus('Import failed: ' + err.message);
                }
            };
            reader.readAsText(file);
            // Reset input so same file can be loaded again
            e.target.value = '';
        }

        serializeProject() {
            return {
                version: 3,
                bpm: this.bpm,
                swing: this.swing,
                patterns: JSON.parse(JSON.stringify(this.state.patterns)),
                currentPattern: this.state.currentPattern,
                songChain: [...this.state.songChain],
                channelParams: JSON.parse(JSON.stringify(this.audio.channelParams)),
                sidechainAmount: this.audio.sidechainAmount,
                sidechainRelease: this.audio.sidechainRelease,
                metronome: { enabled: this.metronome.enabled, volume: this.metronome.volume }
            };
        }

        deserializeProject(data) {
            if (!data) return;
            const version = data.version || 1;

            if (typeof data.bpm === 'number') {
                this.bpm = data.bpm;
                document.getElementById('bpm').value = this.bpm;
            }
            if (typeof data.swing === 'number') {
                this.swing = data.swing;
                document.getElementById('swing').value = this.swing;
                document.getElementById('swing-val').textContent = this.swing + '%';
            }
            if (data.patterns) {
                // Handle v2 -> v3 migration
                if (version <= 2) {
                    // v2 patterns are flat arrays (pattern = array of channels, each channel = array of steps)
                    const migratedPatterns = [];
                    for (let p = 0; p < data.patterns.length; p++) {
                        const oldPat = data.patterns[p];
                        // Check if already in v3 format (has stepsCount property)
                        if (oldPat && oldPat.stepsCount !== undefined) {
                            // Already v3 format, just ensure duration and automation exist
                            for (let ch = 0; ch < CHANNELS.length; ch++) {
                                if (oldPat.channels && oldPat.channels[ch]) {
                                    for (let s = 0; s < oldPat.channels[ch].length; s++) {
                                        if (oldPat.channels[ch][s].duration === undefined) {
                                            oldPat.channels[ch][s].duration = 1;
                                        }
                                    }
                                }
                            }
                            if (!oldPat.automation) oldPat.automation = {};
                            migratedPatterns.push(oldPat);
                        } else if (Array.isArray(oldPat)) {
                            // v2 format: pattern is just an array of channels
                            const stepsCount = (oldPat[0] && oldPat[0].length) || DEFAULT_STEPS;
                            const newPat = { stepsCount: stepsCount, channels: oldPat, automation: {} };
                            // Add duration to each step
                            for (let ch = 0; ch < newPat.channels.length; ch++) {
                                for (let s = 0; s < newPat.channels[ch].length; s++) {
                                    if (newPat.channels[ch][s].duration === undefined) {
                                        newPat.channels[ch][s].duration = 1;
                                    }
                                }
                            }
                            migratedPatterns.push(newPat);
                        }
                    }
                    this.state.patterns = migratedPatterns;
                } else {
                    this.state.patterns = data.patterns;
                }

                while (this.state.patterns.length < NUM_PATTERNS) {
                    this.state.patterns.push(this.state.createEmptyPattern(DEFAULT_STEPS));
                }

                // Ensure all patterns have the new structure
                for (let p = 0; p < this.state.patterns.length; p++) {
                    const pat = this.state.patterns[p];
                    if (!pat.automation) pat.automation = {};
                    if (!pat.stepsCount) pat.stepsCount = DEFAULT_STEPS;
                    if (!pat.channels) {
                        // Shouldn't happen, but safety
                        pat.channels = [];
                        for (let ch = 0; ch < CHANNELS.length; ch++) {
                            const channel = [];
                            for (let s = 0; s < pat.stepsCount; s++) {
                                channel.push({ on: false, velocity: 0.8, note: 48, open: false, duration: 1 });
                            }
                            pat.channels.push(channel);
                        }
                    }
                }
            }
            if (typeof data.currentPattern === 'number') {
                this.state.currentPattern = data.currentPattern;
                this.updatePatternButtons();
            }
            if (data.songChain) {
                this.state.songChain = data.songChain;
            }
            if (data.channelParams) {
                this.audio.channelParams = data.channelParams;
            }
            if (typeof data.sidechainAmount === 'number') {
                this.audio.sidechainAmount = data.sidechainAmount;
                const scEl = document.getElementById('sc-amount');
                if (scEl) {
                    scEl.value = Math.round(data.sidechainAmount * 100);
                    document.getElementById('sc-amount-val').textContent = scEl.value + '%';
                }
            }
            if (typeof data.sidechainRelease === 'number') {
                this.audio.sidechainRelease = data.sidechainRelease;
                const srEl = document.getElementById('sc-release');
                if (srEl) {
                    srEl.value = data.sidechainRelease;
                    document.getElementById('sc-release-val').textContent = data.sidechainRelease + 'ms';
                }
            }
            if (data.metronome) {
                this.metronome.enabled = data.metronome.enabled || false;
                this.metronome.volume = data.metronome.volume || 0.5;
                document.getElementById('btn-metronome').classList.toggle('active', this.metronome.enabled);
            }

            this.syncStepsDropdown();
            this.buildStepIndicators();
            this.buildSequencerGrid();
            this.drawPianoRoll();
            this.drawAutomation();
            this.updateSongChainDisplay();
            this.updateSynthParams();
        }

        autoSave() {
            try {
                const data = this.serializeProject();
                localStorage.setItem('funkybeats-autosave', JSON.stringify(data));
            } catch (e) {
                // Silent fail for autosave
            }
        }

        loadAutoSave() {
            try {
                const saved = localStorage.getItem('funkybeats-autosave');
                if (saved) {
                    const data = JSON.parse(saved);
                    this.deserializeProject(data);
                }
            } catch (e) {
                // Silent fail
            }
        }

        // ---- Visualizer ----
        startVisualizer() {
            const canvas = document.getElementById('visualizer');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;

            const draw = () => {
                this.animFrame = requestAnimationFrame(draw);
                ctx.fillStyle = 'rgba(10, 10, 20, 0.3)';
                ctx.fillRect(0, 0, w, h);

                if (!this.audio.initialized) return;

                // Frequency bars
                const freqData = this.audio.getAnalyserData();
                if (freqData) {
                    const barCount = 64;
                    const barWidth = w / barCount;
                    const step = Math.floor(freqData.length / barCount);

                    for (let i = 0; i < barCount; i++) {
                        const val = freqData[i * step] / 255;
                        const barH = val * h * 0.9;

                        // Color gradient
                        const hue = (i / barCount) * 60 + 10; // orange to yellow
                        ctx.fillStyle = 'hsla(' + hue + ', 100%, 60%, ' + (0.3 + val * 0.7) + ')';
                        ctx.fillRect(i * barWidth, h - barH, barWidth - 1, barH);
                    }
                }

                // Waveform overlay
                const waveData = this.audio.getWaveformData();
                if (waveData) {
                    ctx.strokeStyle = 'rgba(0, 255, 135, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    const sliceW = w / waveData.length;
                    for (let i = 0; i < waveData.length; i++) {
                        const v = waveData[i] / 128.0;
                        const y = (v * h) / 2;
                        if (i === 0) ctx.moveTo(0, y);
                        else ctx.lineTo(i * sliceW, y);
                    }
                    ctx.stroke();
                }

                // Update mixer VUs
                if (this.playing && freqData) {
                    for (let i = 0; i < this.mixerVUs.length; i++) {
                        const idx = Math.floor((i / this.mixerVUs.length) * freqData.length);
                        const val = freqData[idx] / 255;
                        this.mixerVUs[i].style.height = (val * 100) + '%';
                    }
                } else if (!this.playing) {
                    for (let i = 0; i < this.mixerVUs.length; i++) {
                        const current = parseFloat(this.mixerVUs[i].style.height) || 0;
                        if (current > 0) {
                            this.mixerVUs[i].style.height = Math.max(0, current - 2) + '%';
                        }
                    }
                }

                // Redraw piano roll playhead
                if (this.activeTab === 'pianoroll') {
                    this.drawPianoRoll();
                }
                // Redraw automation playhead
                if (this.activeTab === 'automation') {
                    this.drawAutomation();
                }
            };

            draw();
        }

        // ---- Status ----
        setStatus(msg) {
            const statusEl = document.getElementById('status-left');
            if (statusEl) statusEl.textContent = msg;
        }
    }

    // ---- Bootstrap ----
    window.addEventListener('DOMContentLoaded', () => {
        window.app = new FunkyBeatsApp();
    });
})();
