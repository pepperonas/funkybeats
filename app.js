// ============================================
// FUNKYBEATS - Complete Electronic Music Producer
// Web Audio API Synthesized DAW Clone
// v5.0 - Phase 1: Variable Length, Note Duration,
//        Velocity Lane, Automation, Metronome
// Phase 2: Chord/Stab/Organ, Per-Channel EQ & Sends,
//          Sample Playback, Note Glide
// Phase 3: Arrangement View, Drag-to-Paint,
//          Piano Roll Copy/Paste, Humanize, Help Modal
// Phase 4: Chorus/Phaser/Flanger/Bitcrusher,
//          Bus Routing, Sidechain Source Selection
// Phase 5: Preset Browser, Context Menus, Piano Roll
//          Zoom, WAV Export, MIDI Input
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
        { name: 'Chord', type: 'synth', color: '#ff9ff3', synth: 'chord' },
        { name: 'Stab', type: 'synth', color: '#f368e0', synth: 'stab' },
        { name: 'Organ', type: 'synth', color: '#c8d6e5', synth: 'organ' },
    ];

    // QWERTY keyboard piano mapping
    const PIANO_KEYS = { 'z':0,'s':1,'x':2,'d':3,'c':4,'v':5,'g':6,'b':7,'h':8,'n':9,'j':10,'m':11 };

    // ---- Mobile Detection Helpers ----
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // ---- Long-press detection utility ----
    function addLongPress(element, callback, duration) {
        duration = duration || 600;
        let timer = null;
        let startX = 0;
        let startY = 0;
        element.addEventListener('pointerdown', function(e) {
            startX = e.clientX;
            startY = e.clientY;
            timer = setTimeout(function() {
                timer = null;
                callback(e);
            }, duration);
        });
        element.addEventListener('pointermove', function(e) {
            if (timer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
                clearTimeout(timer);
                timer = null;
            }
        });
        element.addEventListener('pointerup', function() {
            if (timer) { clearTimeout(timer); timer = null; }
        });
        element.addEventListener('pointerleave', function() {
            if (timer) { clearTimeout(timer); timer = null; }
        });
    }

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

    // ---- Sample Manager ----
    class SampleManager {
        constructor() {
            this.samples = {}; // channelIdx -> {buffer, name}
        }

        async loadSample(audioCtx, channelIdx, file) {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            this.samples[channelIdx] = { buffer: audioBuffer, name: file.name };
        }

        clearSample(channelIdx) {
            delete this.samples[channelIdx];
        }

        hasSample(channelIdx) {
            return !!this.samples[channelIdx];
        }

        getSample(channelIdx) {
            return this.samples[channelIdx];
        }
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
            this.sidechainSource = 0; // Phase 4: sidechain source channel index
            this.sidechainGains = []; // per non-kick channel

            // Phase 4: Bus routing
            this.drumBusGain = null;
            this.synthBusGain = null;
            this.drumBusCompressor = null;
            this.synthBusCompressor = null;

            // Phase 4: New effects
            this.chorusAmount = 0;
            this.phaserAmount = 0;
            this.flangerAmount = 0;
            this.bitcrusherAmount = 0;
            // Chorus nodes
            this.chorusInputGain = null;
            this.chorusDryGain = null;
            this.chorusWetGain = null;
            this.chorusDelay1 = null;
            this.chorusDelay2 = null;
            this.chorusLfo1 = null;
            this.chorusLfo2 = null;
            this.chorusLfoGain1 = null;
            this.chorusLfoGain2 = null;
            this.chorusOutputGain = null;
            // Phaser nodes
            this.phaserInputGain = null;
            this.phaserDryGain = null;
            this.phaserWetGain = null;
            this.phaserAllpass = [];
            this.phaserOutputGain = null;
            this.phaserLfoInterval = null;
            this.phaserLfoPhase = 0;
            // Flanger nodes
            this.flangerInputGain = null;
            this.flangerDryGain = null;
            this.flangerWetGain = null;
            this.flangerDelay = null;
            this.flangerFeedback = null;
            this.flangerOutputGain = null;
            this.flangerLfoInterval = null;
            this.flangerLfoPhase = 0;
            // Bitcrusher
            this.bitcrusherNode = null;
            this.bitcrusherInputGain = null;
            this.bitcrusherDryGain = null;
            this.bitcrusherWetGain = null;
            this.bitcrusherOutputGain = null;

            // Per-channel EQ
            this.channelEqLow = [];
            this.channelEqMid = [];
            this.channelEqHigh = [];

            // Per-channel send levels
            this.channelReverbSends = [];
            this.channelDelaySends = [];

            // Per-channel synth parameters
            this.channelParams = [];
            this.initChannelParams();

            // Open hihat choke tracking
            this.openHatNodes = [];

            // Sample manager
            this.sampleManager = new SampleManager();

            // Glide tracking: last note frequency per channel
            this.lastNoteFreq = {};
        }

        initChannelParams() {
            this.channelParams = CHANNELS.map((ch, i) => {
                if (ch.type === 'drum') {
                    return {
                        tune: 0, decay: 50, tone: 50, drive: 0,
                        eqLow: 0, eqMid: 0, eqHigh: 0,
                        reverbSend: 20, delaySend: 0
                    };
                } else {
                    const base = {
                        waveform: 'sawtooth', attack: 10, decay: 50,
                        cutoff: 70, resonance: 5, detune: 5, glide: 0,
                        eqLow: 0, eqMid: 0, eqHigh: 0,
                        reverbSend: 20, delaySend: 0
                    };
                    // Chord channel gets extra chordType param
                    if (i === 8) {
                        base.chordType = 'minor';
                    }
                    return base;
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

            // Phase 4: Bus gains and compressors
            this.drumBusGain = this.ctx.createGain();
            this.drumBusGain.gain.value = 1.0;
            this.synthBusGain = this.ctx.createGain();
            this.synthBusGain.gain.value = 1.0;
            this.drumBusCompressor = this.ctx.createDynamicsCompressor();
            this.drumBusCompressor.threshold.value = -18;
            this.drumBusCompressor.knee.value = 20;
            this.drumBusCompressor.ratio.value = 4;
            this.drumBusCompressor.attack.value = 0.003;
            this.drumBusCompressor.release.value = 0.15;
            this.synthBusCompressor = this.ctx.createDynamicsCompressor();
            this.synthBusCompressor.threshold.value = -18;
            this.synthBusCompressor.knee.value = 20;
            this.synthBusCompressor.ratio.value = 3;
            this.synthBusCompressor.attack.value = 0.005;
            this.synthBusCompressor.release.value = 0.25;

            // Bus routing: drumBusGain -> drumBusCompressor -> filterNode
            this.drumBusGain.connect(this.drumBusCompressor);
            this.drumBusCompressor.connect(this.filterNode);
            // Bus routing: synthBusGain -> synthBusCompressor -> filterNode
            this.synthBusGain.connect(this.synthBusCompressor);
            this.synthBusCompressor.connect(this.filterNode);

            // Channel gains, pans, EQ, and sends
            for (let i = 0; i < CHANNELS.length; i++) {
                const gain = this.ctx.createGain();
                gain.gain.value = 0.8;
                const pan = this.ctx.createStereoPanner();
                pan.pan.value = 0;
                this.channelGains.push(gain);
                this.channelPans.push(pan);

                // Sidechain gain node
                const scGain = this.ctx.createGain();
                scGain.gain.value = 1;
                this.sidechainGains.push(scGain);

                // Per-channel 3-band EQ
                const eqLow = this.ctx.createBiquadFilter();
                eqLow.type = 'lowshelf';
                eqLow.frequency.value = 80;
                eqLow.gain.value = this.channelParams[i].eqLow || 0;

                const eqMid = this.ctx.createBiquadFilter();
                eqMid.type = 'peaking';
                eqMid.frequency.value = 1000;
                eqMid.Q.value = 1.0;
                eqMid.gain.value = this.channelParams[i].eqMid || 0;

                const eqHigh = this.ctx.createBiquadFilter();
                eqHigh.type = 'highshelf';
                eqHigh.frequency.value = 8000;
                eqHigh.gain.value = this.channelParams[i].eqHigh || 0;

                this.channelEqLow.push(eqLow);
                this.channelEqMid.push(eqMid);
                this.channelEqHigh.push(eqHigh);

                // Per-channel reverb and delay sends
                const reverbSend = this.ctx.createGain();
                reverbSend.gain.value = (this.channelParams[i].reverbSend || 20) / 100;
                const delaySend = this.ctx.createGain();
                delaySend.gain.value = (this.channelParams[i].delaySend || 0) / 100;

                this.channelReverbSends.push(reverbSend);
                this.channelDelaySends.push(delaySend);

                // Routing: channelGain -> eqLow -> eqMid -> eqHigh -> pan -> sidechainGain -> bus
                gain.connect(eqLow);
                eqLow.connect(eqMid);
                eqMid.connect(eqHigh);
                eqHigh.connect(pan);
                pan.connect(scGain);
                // Phase 4: Route to appropriate bus instead of directly to filter
                if (i <= 4) {
                    scGain.connect(this.drumBusGain);
                } else {
                    scGain.connect(this.synthBusGain);
                }

                // Send routing: after eqHigh, also connect to reverb/delay sends
                eqHigh.connect(reverbSend);
                eqHigh.connect(delaySend);
                reverbSend.connect(this.reverbNode);
                delaySend.connect(this.delayNode);
            }

            // Phase 4: Create new effect nodes
            // Chorus: 2 delay lines with slight offsets, detuned by LFO
            this.chorusInputGain = this.ctx.createGain();
            this.chorusInputGain.gain.value = 1;
            this.chorusDryGain = this.ctx.createGain();
            this.chorusDryGain.gain.value = 1;
            this.chorusWetGain = this.ctx.createGain();
            this.chorusWetGain.gain.value = 0;
            this.chorusOutputGain = this.ctx.createGain();
            this.chorusOutputGain.gain.value = 1;
            this.chorusDelay1 = this.ctx.createDelay(0.1);
            this.chorusDelay1.delayTime.value = 0.007;
            this.chorusDelay2 = this.ctx.createDelay(0.1);
            this.chorusDelay2.delayTime.value = 0.011;
            this.chorusLfo1 = this.ctx.createOscillator();
            this.chorusLfo1.type = 'sine';
            this.chorusLfo1.frequency.value = 0.8;
            this.chorusLfoGain1 = this.ctx.createGain();
            this.chorusLfoGain1.gain.value = 0.002;
            this.chorusLfo2 = this.ctx.createOscillator();
            this.chorusLfo2.type = 'sine';
            this.chorusLfo2.frequency.value = 1.2;
            this.chorusLfoGain2 = this.ctx.createGain();
            this.chorusLfoGain2.gain.value = 0.002;
            this.chorusLfo1.connect(this.chorusLfoGain1);
            this.chorusLfoGain1.connect(this.chorusDelay1.delayTime);
            this.chorusLfo2.connect(this.chorusLfoGain2);
            this.chorusLfoGain2.connect(this.chorusDelay2.delayTime);
            this.chorusLfo1.start();
            this.chorusLfo2.start();
            // Chorus routing: input -> dry -> output, input -> delay1 + delay2 -> wet -> output
            this.chorusInputGain.connect(this.chorusDryGain);
            this.chorusDryGain.connect(this.chorusOutputGain);
            this.chorusInputGain.connect(this.chorusDelay1);
            this.chorusInputGain.connect(this.chorusDelay2);
            this.chorusDelay1.connect(this.chorusWetGain);
            this.chorusDelay2.connect(this.chorusWetGain);
            this.chorusWetGain.connect(this.chorusOutputGain);

            // Phaser: 4 allpass filters with LFO sweeping frequency
            this.phaserInputGain = this.ctx.createGain();
            this.phaserInputGain.gain.value = 1;
            this.phaserDryGain = this.ctx.createGain();
            this.phaserDryGain.gain.value = 1;
            this.phaserWetGain = this.ctx.createGain();
            this.phaserWetGain.gain.value = 0;
            this.phaserOutputGain = this.ctx.createGain();
            this.phaserOutputGain.gain.value = 1;
            this.phaserAllpass = [];
            let prevNode = this.phaserInputGain;
            for (let i = 0; i < 4; i++) {
                const ap = this.ctx.createBiquadFilter();
                ap.type = 'allpass';
                ap.frequency.value = 1000;
                ap.Q.value = 0.5;
                this.phaserAllpass.push(ap);
            }
            // Chain allpass: input -> ap0 -> ap1 -> ap2 -> ap3 -> wetGain
            this.phaserAllpass[0].connect(this.phaserAllpass[1]);
            this.phaserAllpass[1].connect(this.phaserAllpass[2]);
            this.phaserAllpass[2].connect(this.phaserAllpass[3]);
            this.phaserInputGain.connect(this.phaserAllpass[0]);
            this.phaserAllpass[3].connect(this.phaserWetGain);
            this.phaserInputGain.connect(this.phaserDryGain);
            this.phaserDryGain.connect(this.phaserOutputGain);
            this.phaserWetGain.connect(this.phaserOutputGain);
            // LFO via setInterval
            this.phaserLfoPhase = 0;
            this.phaserLfoInterval = setInterval(() => {
                if (this.phaserAmount <= 0) return;
                this.phaserLfoPhase += 0.05;
                const freq = 600 + 2400 * (0.5 + 0.5 * Math.sin(this.phaserLfoPhase));
                for (const ap of this.phaserAllpass) {
                    ap.frequency.value = freq;
                }
            }, 30);

            // Flanger: short delay with feedback, LFO on delay time
            this.flangerInputGain = this.ctx.createGain();
            this.flangerInputGain.gain.value = 1;
            this.flangerDryGain = this.ctx.createGain();
            this.flangerDryGain.gain.value = 1;
            this.flangerWetGain = this.ctx.createGain();
            this.flangerWetGain.gain.value = 0;
            this.flangerOutputGain = this.ctx.createGain();
            this.flangerOutputGain.gain.value = 1;
            this.flangerDelay = this.ctx.createDelay(0.02);
            this.flangerDelay.delayTime.value = 0.003;
            this.flangerFeedback = this.ctx.createGain();
            this.flangerFeedback.gain.value = 0.5;
            // Flanger routing
            this.flangerInputGain.connect(this.flangerDryGain);
            this.flangerDryGain.connect(this.flangerOutputGain);
            this.flangerInputGain.connect(this.flangerDelay);
            this.flangerDelay.connect(this.flangerFeedback);
            this.flangerFeedback.connect(this.flangerDelay);
            this.flangerDelay.connect(this.flangerWetGain);
            this.flangerWetGain.connect(this.flangerOutputGain);
            // LFO via setInterval
            this.flangerLfoPhase = 0;
            this.flangerLfoInterval = setInterval(() => {
                if (this.flangerAmount <= 0) return;
                this.flangerLfoPhase += 0.04;
                const delay = 0.001 + 0.004 * (0.5 + 0.5 * Math.sin(this.flangerLfoPhase));
                this.flangerDelay.delayTime.value = delay;
            }, 30);

            // Bitcrusher: ScriptProcessorNode
            this.bitcrusherNode = this.ctx.createScriptProcessor(4096, 1, 1);
            this.bitcrusherInputGain = this.ctx.createGain();
            this.bitcrusherInputGain.gain.value = 1;
            this.bitcrusherDryGain = this.ctx.createGain();
            this.bitcrusherDryGain.gain.value = 1;
            this.bitcrusherWetGain = this.ctx.createGain();
            this.bitcrusherWetGain.gain.value = 0;
            this.bitcrusherOutputGain = this.ctx.createGain();
            this.bitcrusherOutputGain.gain.value = 1;
            const self = this;
            this.bitcrusherNode.onaudioprocess = function(e) {
                const input = e.inputBuffer.getChannelData(0);
                const output = e.outputBuffer.getChannelData(0);
                const amount = self.bitcrusherAmount;
                if (amount <= 0) {
                    for (let i = 0; i < input.length; i++) output[i] = input[i];
                    return;
                }
                const bits = Math.round(1 + (1 - amount) * 15);
                const step = Math.pow(0.5, bits);
                for (let i = 0; i < input.length; i++) {
                    output[i] = step * Math.floor(input[i] / step + 0.5);
                }
            };
            // Bitcrusher routing
            this.bitcrusherInputGain.connect(this.bitcrusherDryGain);
            this.bitcrusherDryGain.connect(this.bitcrusherOutputGain);
            this.bitcrusherInputGain.connect(this.bitcrusherNode);
            this.bitcrusherNode.connect(this.bitcrusherWetGain);
            this.bitcrusherWetGain.connect(this.bitcrusherOutputGain);

            // Signal chain: filter -> chorus -> phaser -> flanger -> bitcrusher -> distortion -> compressor -> masterGain -> analyser -> destination
            this.filterNode.connect(this.chorusInputGain);
            this.chorusOutputGain.connect(this.phaserInputGain);
            this.phaserOutputGain.connect(this.flangerInputGain);
            this.flangerOutputGain.connect(this.bitcrusherInputGain);
            this.bitcrusherOutputGain.connect(this.distortionNode);
            this.distortionNode.connect(this.compressor);
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);

            // Reverb: reverbNode -> reverbGain -> masterGain
            // (per-channel sends connect to reverbNode directly above)
            this.reverbNode.connect(this.reverbGain);
            this.reverbGain.connect(this.masterGain);

            // Delay: delayNode -> delayFeedback -> delayNode, delayNode -> delayGain -> masterGain
            // (per-channel sends connect to delayNode directly above)
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

        // Per-channel EQ setter
        setChannelEq(ch, band, dB) {
            if (band === 'low' && this.channelEqLow[ch]) {
                this.channelEqLow[ch].gain.value = dB;
            } else if (band === 'mid' && this.channelEqMid[ch]) {
                this.channelEqMid[ch].gain.value = dB;
            } else if (band === 'high' && this.channelEqHigh[ch]) {
                this.channelEqHigh[ch].gain.value = dB;
            }
            this.channelParams[ch]['eq' + band.charAt(0).toUpperCase() + band.slice(1)] = dB;
        }

        // Per-channel send setters
        setChannelReverbSend(ch, val) {
            if (this.channelReverbSends[ch]) {
                this.channelReverbSends[ch].gain.value = val / 100;
            }
            this.channelParams[ch].reverbSend = val;
        }

        setChannelDelaySend(ch, val) {
            if (this.channelDelaySends[ch]) {
                this.channelDelaySends[ch].gain.value = val / 100;
            }
            this.channelParams[ch].delaySend = val;
        }

        // Sidechain: duck non-source channels when source fires
        triggerSidechain(time) {
            if (this.sidechainAmount <= 0) return;
            for (let i = 0; i < CHANNELS.length; i++) {
                if (i === this.sidechainSource) continue; // Don't duck the source itself
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

        // ---- Sample Playback ----
        playSampleNote(channelIdx, time, velocity, note) {
            const sample = this.sampleManager.getSample(channelIdx);
            if (!sample) return;
            const source = this.ctx.createBufferSource();
            source.buffer = sample.buffer;
            // Apply tune from channelParams
            const tune = this.channelParams[channelIdx].tune || 0;
            source.playbackRate.value = Math.pow(2, tune / 12);
            // For synth channels, also pitch by note difference from C3 (48)
            if (CHANNELS[channelIdx].type === 'synth' && note) {
                source.playbackRate.value *= Math.pow(2, (note - 48) / 12);
            }
            const gain = this.ctx.createGain();
            gain.gain.value = velocity;
            // Apply decay
            const decayTime = (this.channelParams[channelIdx].decay || 50) / 100 * 2;
            gain.gain.setValueAtTime(velocity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
            source.connect(gain);
            gain.connect(this.channelGains[channelIdx]);
            source.start(time);
            source.stop(time + decayTime + 0.01);
        }

        // ---- Helper for glide ----
        applyGlide(osc, freq, time, channelIdx) {
            const params = this.channelParams[channelIdx];
            const glide = params.glide || 0;
            if (glide > 0 && this.lastNoteFreq[channelIdx]) {
                const glideTime = (glide / 100) * 0.3;
                osc.frequency.setValueAtTime(this.lastNoteFreq[channelIdx], time);
                osc.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
            } else {
                osc.frequency.value = freq;
            }
            this.lastNoteFreq[channelIdx] = freq;
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
            this.applyGlide(osc, freq, time, channelIdx);
            osc.detune.value = -(params.detune || 5);
            osc2.type = params.waveform || 'sawtooth';
            this.applyGlide(osc2, freq, time, channelIdx);
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
            this.applyGlide(osc, freq, time, channelIdx);
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
            this.applyGlide(osc1, freq, time, channelIdx);
            osc1.detune.value = -(params.detune || 5);
            osc2.type = params.waveform || 'sawtooth';
            this.applyGlide(osc2, freq, time, channelIdx);
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

        // ---- Phase 2: Chord Voice ----
        playChord(time, note = 60, velocity = 0.8, channelIdx = 8, noteLength = 0.3) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const freq = midiToFreq(note);
            const attackTime = (params.attack / 100) * 0.2;
            const decayTime = Math.max(0.1 + (params.decay / 100) * 0.6, noteLength);
            const cutoff = 300 + (params.cutoff / 100) * 6000;

            // Determine intervals based on chord type
            const chordType = params.chordType || 'minor';
            let intervals;
            switch (chordType) {
                case 'major': intervals = [0, 4, 7]; break;
                case 'minor': intervals = [0, 3, 7]; break;
                case '7th': intervals = [0, 4, 7, 10]; break;
                case 'min7': intervals = [0, 3, 7, 10]; break;
                default: intervals = [0, 3, 7]; break;
            }

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(cutoff * 2, time);
            filter.frequency.exponentialRampToValueAtTime(cutoff, time + attackTime + decayTime * 0.4);
            filter.Q.value = params.resonance || 4;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.25 / intervals.length * 2, time + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);

            const oscs = [];
            for (let i = 0; i < intervals.length; i++) {
                const chordFreq = freq * Math.pow(2, intervals[i] / 12);
                const osc = this.ctx.createOscillator();
                osc.type = params.waveform || 'sawtooth';
                if (i === 0) {
                    this.applyGlide(osc, chordFreq, time, channelIdx);
                } else {
                    osc.frequency.value = chordFreq;
                }
                // Slight detune for warmth
                osc.detune.value = (i % 2 === 0 ? 3 : -3) + (params.detune || 5) * (i === 0 ? -1 : 1);
                osc.connect(filter);
                osc.start(time);
                osc.stop(time + attackTime + decayTime + 0.01);
                oscs.push(osc);
            }

            filter.connect(gain);
            gain.connect(this.channelGains[channelIdx]);
        }

        // ---- Phase 2: Stab Voice ----
        playStab(time, note = 60, velocity = 0.8, channelIdx = 9, noteLength = 0.1) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const freq = midiToFreq(note);
            // Very short decay for stab character
            const decayTime = 0.05 + (params.decay / 100) * 0.1;
            const cutoff = 500 + (params.cutoff / 100) * 8000;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = params.waveform || 'sawtooth';
            this.applyGlide(osc, freq, time, channelIdx);
            osc.detune.value = params.detune || 5;

            filter.type = 'bandpass';
            filter.frequency.value = cutoff;
            filter.Q.value = Math.max(params.resonance || 8, 4); // High resonance for character

            // Sharp attack (near zero)
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.5, time + 0.003);
            gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.channelGains[channelIdx]);

            osc.start(time);
            osc.stop(time + decayTime + 0.01);
        }

        // ---- Phase 2: Organ Voice ----
        playOrgan(time, note = 60, velocity = 0.8, channelIdx = 10, noteLength = 0.5) {
            if (!this.ctx) return;
            const params = this.channelParams[channelIdx];
            const freq = midiToFreq(note);
            const attackTime = 0.01 + (params.attack / 100) * 0.3;
            const decayTime = Math.max(0.2 + (params.decay / 100) * 1.5, noteLength);
            const brightness = (params.cutoff || 70) / 100; // 0-1 used as brightness

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 500 + brightness * 8000;
            filter.Q.value = 0.5;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.2, time + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);

            // Additive synthesis: 5 sine oscillators at harmonics 1x, 2x, 3x, 4x, 8x
            const harmonics = [1, 2, 3, 4, 8];
            // Higher brightness = more upper harmonics
            const levels = harmonics.map((h, i) => {
                if (i === 0) return 1.0;
                return Math.max(0.05, brightness * (1 - i * 0.15));
            });

            const oscs = [];
            for (let i = 0; i < harmonics.length; i++) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                const hFreq = freq * harmonics[i];
                if (i === 0) {
                    this.applyGlide(osc, hFreq, time, channelIdx);
                } else {
                    osc.frequency.value = hFreq;
                }
                // Slight detune for chorus effect
                osc.detune.value = (params.detune || 3) * (i % 2 === 0 ? 1 : -1) * 0.5;

                const oscGain = this.ctx.createGain();
                oscGain.gain.value = levels[i];
                osc.connect(oscGain);
                oscGain.connect(filter);
                osc.start(time);
                osc.stop(time + attackTime + decayTime + 0.01);
                oscs.push(osc);
            }

            filter.connect(gain);
            gain.connect(this.channelGains[channelIdx]);
        }

        // ---- Play any channel ----
        playChannel(channelIdx, time, velocity, note, isOpen, noteLength) {
            if (!this.ctx) return;
            // Check mute/solo
            const hasSolo = this.channelSolo.some(s => s);
            if (hasSolo && !this.channelSolo[channelIdx]) return;
            if (!hasSolo && this.channelMuted[channelIdx]) return;

            // Phase 4: Trigger sidechain from configured source
            if (channelIdx === this.sidechainSource) {
                this.triggerSidechain(time);
            }

            // Check if sample is loaded for this channel - play sample instead
            if (this.sampleManager.hasSample(channelIdx)) {
                this.playSampleNote(channelIdx, time, velocity, note);
                return;
            }

            switch (channelIdx) {
                case 0: this.playKick(time, velocity, channelIdx); break;
                case 1: this.playSnare(time, velocity, channelIdx); break;
                case 2: this.playHihat(time, velocity, channelIdx, isOpen); break;
                case 3: this.playClap(time, velocity, channelIdx); break;
                case 4: this.playPerc(time, velocity, channelIdx); break;
                case 5: this.playBass(time, note || 36, velocity, channelIdx, noteLength); break;
                case 6: this.playLead(time, note || 60, velocity, channelIdx, noteLength); break;
                case 7: this.playPad(time, note || 60, velocity, channelIdx, noteLength); break;
                case 8: this.playChord(time, note || 60, velocity, channelIdx, noteLength); break;
                case 9: this.playStab(time, note || 60, velocity, channelIdx, noteLength); break;
                case 10: this.playOrgan(time, note || 60, velocity, channelIdx, noteLength); break;
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
                case 8: this.playChord(time, note, 0.7, 8); break;
                case 9: this.playStab(time, note, 0.7, 9); break;
                case 10: this.playOrgan(time, note, 0.7, 10); break;
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

        // Phase 4: Chorus amount (0-1)
        setChorus(amount) {
            this.chorusAmount = amount;
            if (this.chorusWetGain) {
                this.chorusWetGain.gain.value = amount * 0.5;
                this.chorusDryGain.gain.value = 1 - amount * 0.3;
            }
            // Vary LFO depth with amount
            if (this.chorusLfoGain1) {
                this.chorusLfoGain1.gain.value = 0.001 + amount * 0.003;
                this.chorusLfoGain2.gain.value = 0.001 + amount * 0.003;
            }
        }

        // Phase 4: Phaser amount (0-1)
        setPhaser(amount) {
            this.phaserAmount = amount;
            if (this.phaserWetGain) {
                this.phaserWetGain.gain.value = amount * 0.7;
                this.phaserDryGain.gain.value = 1 - amount * 0.3;
            }
        }

        // Phase 4: Flanger amount (0-1)
        setFlanger(amount) {
            this.flangerAmount = amount;
            if (this.flangerWetGain) {
                this.flangerWetGain.gain.value = amount * 0.6;
                this.flangerDryGain.gain.value = 1 - amount * 0.3;
            }
            if (this.flangerFeedback) {
                this.flangerFeedback.gain.value = 0.3 + amount * 0.4;
            }
        }

        // Phase 4: Bitcrusher amount (0-1)
        setBitcrusher(amount) {
            this.bitcrusherAmount = amount;
            if (this.bitcrusherWetGain) {
                this.bitcrusherWetGain.gain.value = amount > 0.01 ? 1 : 0;
                this.bitcrusherDryGain.gain.value = amount > 0.01 ? 0 : 1;
            }
        }

        // Phase 4: Bus volume setters
        setDrumBusVolume(val) {
            if (this.drumBusGain) this.drumBusGain.gain.value = val;
        }

        setSynthBusVolume(val) {
            if (this.synthBusGain) this.synthBusGain.gain.value = val;
        }

        // Phase 4: Bus compressor setters (amount 0-1)
        setDrumBusCompressor(amount) {
            if (this.drumBusCompressor) {
                this.drumBusCompressor.threshold.value = -12 - amount * 24;
                this.drumBusCompressor.ratio.value = 2 + amount * 10;
            }
        }

        setSynthBusCompressor(amount) {
            if (this.synthBusCompressor) {
                this.synthBusCompressor.threshold.value = -12 - amount * 24;
                this.synthBusCompressor.ratio.value = 2 + amount * 10;
            }
        }
    }

    // ---- Sequencer State ----
    // Pattern colors for arrangement view
    const PATTERN_COLORS = [
        '#ff6b35', '#ffd93d', '#4fc3f7', '#bb86fc',
        '#ff4757', '#00ff87', '#ff6bb5', '#64ffda'
    ];

    class SequencerState {
        constructor() {
            this.patterns = [];
            this.currentPattern = 0;
            this.undoStack = [];
            this.redoStack = [];
            this.patternClipboard = null;
            this.songChain = [];
            // Phase 3: Arrangement (1D array, each slot = pattern index or -1 for empty)
            this.arrangement = [];
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
                arrangement: [...this.arrangement],
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
            if (data.arrangement) {
                this.arrangement = data.arrangement;
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

    // ---- Phase 5: Preset Metadata (separate from pattern data) ----
    const PRESET_META = {
        'four-on-floor': { artist: 'Classic', tags: ['house', '4x4'], description: 'Classic four-on-the-floor house beat' },
        'breakbeat': { artist: 'Classic', tags: ['breakbeat', 'breaks'], description: 'Syncopated breakbeat pattern' },
        'minimal-techno': { artist: 'Classic', tags: ['techno', 'minimal'], description: 'Stripped-down minimal techno groove' },
        'deep-house': { artist: 'Classic', tags: ['house', 'deep'], description: 'Deep house with subtle grooves' },
        'drum-n-bass': { artist: 'Classic', tags: ['dnb', 'jungle'], description: 'Fast-paced drum and bass rhythm' },
        'phonk-jackin': { artist: 'Phonk D', tags: ['jackin', 'house', 'funk'], description: 'Jackin house with ghost kicks' },
        'phonk-filtered-disko': { artist: 'Phonk D', tags: ['disco', 'house', 'filter'], description: 'Filtered disco house with off-beat hats' },
        'phonk-bumpin': { artist: 'Phonk D', tags: ['percussion', 'house', 'funk'], description: 'Percussion-driven funky house' },
        'phonk-stabs': { artist: 'Phonk D', tags: ['stabs', 'house', 'funk'], description: 'Off-beat funk stabs with chromatic bass' },
        'phonk-deep-jackin': { artist: 'Phonk D', tags: ['deep', 'jackin', 'house'], description: 'Deep jackin house with warm pads' },
        'storken-lille-vals': { artist: 'Storken', tags: ['disco', 'waltz', 'nu-disco'], description: 'Waltz polyrhythm in 4/4, arpeggio lead' },
        'storken-skogsdisko': { artist: 'Storken', tags: ['disco', 'organic', 'nu-disco'], description: 'Forest disco with pentatonic bass walk' },
        'storken-italo-arp': { artist: 'Storken', tags: ['italo', 'arpeggio', 'disco'], description: 'Full 16-step Bb major arpeggio sequence' },
        'storken-scandi-cosmic': { artist: 'Storken', tags: ['cosmic', 'disco', 'space'], description: 'Cosmic disco with wide bass intervals' },
        'storken-stupidisco': { artist: 'Storken', tags: ['disco', 'energy', 'pop'], description: 'Energetic pop-disco with bouncy bass' },
        'hammann-808mate': { artist: 'T. Hammann', tags: ['minimal', 'acid', 'workshop'], description: 'Reduced acid bass with shuffled drums' },
        'hammann-liquid': { artist: 'T. Hammann', tags: ['deep', 'house', 'piano'], description: 'Seductive deep house with syncopated chords' },
        'hammann-wahwah': { artist: 'T. Hammann', tags: ['boogie', 'disco', 'funk'], description: 'Wah-wah guitar stabs with boogie bass' },
        'hammann-ffm-deep': { artist: 'T. Hammann', tags: ['deep', 'minimal', 'ambient'], description: 'Ultra-reduced Frankfurt deep house' },
        'hammann-digger': { artist: 'T. Hammann', tags: ['chicago', 'jazz', 'eclectic'], description: 'Eclectic jazz-funk meets Chicago house' },
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

            // Piano roll selection (Phase 3)
            this.pianoRollSelMode = false;
            this.pianoRollSelection = { active: false, startStep: 0, startNote: 0, endStep: 0, endNote: 0 };
            this.pianoRollSelecting = false;
            this.pianoRollNoteClipboard = null;
            this.pianoRollLastClickStep = 0;
            this.pianoRollLastClickNote = 48;

            // Velocity lane drag state
            this.velocityDragging = false;

            // Drag-to-paint (Phase 3)
            this.dragPainting = false;
            this.dragPaintValue = false;
            this.dragPaintChannel = -1;
            this.dragPaintedSteps = new Set();

            // Arrangement view (Phase 3)
            this.arrangementCanvas = null;
            this.arrangementCtx = null;
            this.currentBar = 0;
            this.arrangementSelectedPattern = 0;
            this.arrangementPainting = false;

            // Help modal (Phase 3)
            this.helpModalOpen = false;

            // Phase 5: Preset browser
            this.presetBrowserOpen = false;

            // Phase 5: Context menu
            this.activeContextMenu = null;

            // Phase 5: Piano Roll Zoom
            this.pianoRollZoom = 1.0;
            this.pianoRollScrollX = 0;

            // Phase 5: MIDI
            this.midiAccess = null;
            this.midiConnected = false;

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
            this.initMIDI();
            this.initMobile();
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
            this.initArrangementCanvas();
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

                // EQ section
                const eqSection = el('div', { className: 'mixer-eq-section' });
                const eqBands = [
                    { label: 'L', band: 'low' },
                    { label: 'M', band: 'mid' },
                    { label: 'H', band: 'high' }
                ];
                for (const eqDef of eqBands) {
                    const eqGroup = el('div', { className: 'mixer-eq-group' });
                    const eqLabel = el('label', { text: eqDef.label });
                    const eqRange = el('input', {
                        type: 'range', className: 'mixer-eq-range',
                        min: '-12', max: '12', value: '0', step: '1'
                    });
                    eqRange.dataset.channel = i;
                    eqRange.dataset.band = eqDef.band;
                    eqGroup.appendChild(eqLabel);
                    eqGroup.appendChild(eqRange);
                    eqSection.appendChild(eqGroup);
                }

                // Send section
                const sendSection = el('div', { className: 'mixer-send-section' });
                const sends = [
                    { label: 'REV', param: 'reverbSend', defaultVal: '20' },
                    { label: 'DLY', param: 'delaySend', defaultVal: '0' }
                ];
                for (const sendDef of sends) {
                    const sendGroup = el('div', { className: 'mixer-send-group' });
                    const sendLabel = el('label', { text: sendDef.label });
                    const sendRange = el('input', {
                        type: 'range', className: 'mixer-send-range',
                        min: '0', max: '100', value: sendDef.defaultVal, step: '1'
                    });
                    sendRange.dataset.channel = i;
                    sendRange.dataset.sendParam = sendDef.param;
                    sendGroup.appendChild(sendLabel);
                    sendGroup.appendChild(sendRange);
                    sendSection.appendChild(sendGroup);
                }

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
                ch.appendChild(eqSection);
                ch.appendChild(sendSection);
                ch.appendChild(btnsDiv);

                container.appendChild(ch);
            }

            // Phase 4: Bus channel strips (DRUMS and SYNTHS)
            const busConfigs = [
                { name: 'DRUMS', busType: 'drums', color: '#ff6b35' },
                { name: 'SYNTHS', busType: 'synths', color: '#00ff87' }
            ];
            for (const busCfg of busConfigs) {
                const busCh = el('div', { className: 'mixer-channel bus-channel' });
                busCh.style.borderColor = busCfg.color;

                const busColorDot = el('div', { className: 'mixer-color-dot' });
                busColorDot.style.backgroundColor = busCfg.color;

                const busName = el('div', { className: 'mixer-channel-name', text: busCfg.name });
                busName.style.color = busCfg.color;

                const busVuContainer = el('div', { className: 'mixer-vu' });
                const busVuFill = el('div', { className: 'mixer-vu-fill' });
                busVuFill.style.height = '0%';
                busVuContainer.appendChild(busVuFill);
                this.mixerVUs.push(busVuFill);

                const busFaderContainer = el('div', { className: 'mixer-fader-container' });
                const busFader = el('input', { type: 'range', className: 'mixer-fader', min: '0', max: '100', value: '100' });
                busFader.dataset.busType = busCfg.busType;
                busFaderContainer.appendChild(busFader);

                const busDb = el('div', { className: 'mixer-db', text: '0.0dB' });

                // Compressor knob
                const busCompGroup = el('div', { className: 'mixer-eq-group' });
                const busCompLabel = el('label', { text: 'COMP' });
                const busCompRange = el('input', {
                    type: 'range', className: 'mixer-eq-range',
                    min: '0', max: '100', value: '30', step: '1'
                });
                busCompRange.dataset.busType = busCfg.busType;
                busCompRange.dataset.busParam = 'compressor';
                busCompGroup.appendChild(busCompLabel);
                busCompGroup.appendChild(busCompRange);

                busCh.appendChild(busColorDot);
                busCh.appendChild(busName);
                busCh.appendChild(busVuContainer);
                busCh.appendChild(busFaderContainer);
                busCh.appendChild(busDb);
                busCh.appendChild(busCompGroup);

                container.appendChild(busCh);
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
            this.updateSampleSection();
        }

        updateSampleSection() {
            const container = document.getElementById('synth-sample-section');
            if (!container) return;
            while (container.firstChild) container.removeChild(container.firstChild);

            const ch = this.synthEditorChannel;
            const sampleLabel = el('span', { className: 'sample-label', text: 'SAMPLE' });
            container.appendChild(sampleLabel);

            const hasSample = this.audio.sampleManager.hasSample(ch);
            const sampleName = el('span', {
                className: 'sample-name' + (hasSample ? ' loaded' : ''),
                text: hasSample ? this.audio.sampleManager.getSample(ch).name : 'No sample loaded'
            });
            container.appendChild(sampleName);

            const loadBtn = el('button', { className: 'tool-btn', text: 'LOAD' });
            loadBtn.addEventListener('click', () => {
                const fileInput = document.getElementById('sample-import');
                if (fileInput) {
                    fileInput.dataset.targetChannel = ch;
                    fileInput.click();
                }
            });
            container.appendChild(loadBtn);

            if (hasSample) {
                const clearBtn = el('button', { className: 'tool-btn', text: 'CLEAR' });
                clearBtn.addEventListener('click', () => {
                    this.audio.sampleManager.clearSample(ch);
                    this.updateSampleSection();
                    this.setStatus('Sample cleared from ' + CHANNELS[ch].name);
                });
                container.appendChild(clearBtn);
            }
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
                // Synth params: waveform, attack, decay, cutoff, resonance, detune, glide
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
                container.appendChild(this.createParamSlider('GLIDE', 'glide', params.glide || 0, 0, 100, 1, v => v + '%'));

                // Chord channel gets extra chord type dropdown
                if (ch === 8) {
                    const chordGroup = el('div', { className: 'synth-param-group' });
                    const chordLabel = el('label', { text: 'CHORD TYPE' });
                    const chordSelect = el('select', { className: 'synth-select' });
                    chordSelect.dataset.param = 'chordType';
                    ['major', 'minor', '7th', 'min7'].forEach(ct => {
                        const opt = el('option', { value: ct, text: ct.toUpperCase() });
                        if (params.chordType === ct) opt.selected = true;
                        chordSelect.appendChild(opt);
                    });
                    chordGroup.appendChild(chordLabel);
                    chordGroup.appendChild(chordSelect);
                    container.appendChild(chordGroup);
                }
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
            this.drawArrangement();
        }

        updateSongChainDisplay() {
            // Legacy song chain display is now hidden, arrangement canvas is primary
            const info = document.getElementById('song-info');
            if (info) {
                const arr = this.state.arrangement;
                const filledBars = arr.filter(v => v >= 0).length;
                info.textContent = filledBars + ' bars in arrangement (' + arr.length + ' total)';
            }
            this.drawArrangement();
        }

        initArrangementCanvas() {
            this.arrangementCanvas = document.getElementById('arrangement-canvas');
            if (this.arrangementCanvas) {
                this.arrangementCtx = this.arrangementCanvas.getContext('2d');
                this.drawArrangement();
            }
        }

        drawArrangement() {
            if (!this.arrangementCtx || !this.arrangementCanvas) return;
            const ctx = this.arrangementCtx;
            const w = this.arrangementCanvas.width;
            const h = this.arrangementCanvas.height;
            const arr = this.state.arrangement;
            const totalBars = Math.max(arr.length, 16);
            const barW = w / totalBars;
            const headerH = 20;
            const trackH = h - headerH;

            ctx.clearRect(0, 0, w, h);

            // Background
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, w, h);

            // Header background
            ctx.fillStyle = '#151528';
            ctx.fillRect(0, 0, w, headerH);

            // Bar numbers and vertical lines
            for (let b = 0; b < totalBars; b++) {
                // Vertical grid
                ctx.strokeStyle = b % 4 === 0 ? '#333355' : '#1a1a35';
                ctx.lineWidth = b % 4 === 0 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(b * barW, 0);
                ctx.lineTo(b * barW, h);
                ctx.stroke();

                // Bar number
                if (barW > 15 || b % 2 === 0) {
                    ctx.fillStyle = '#666688';
                    ctx.font = '9px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(String(b + 1), b * barW + barW / 2, 13);
                }
            }

            // Draw pattern blocks
            for (let b = 0; b < arr.length; b++) {
                const patIdx = arr[b];
                if (patIdx < 0) continue;

                const color = PATTERN_COLORS[patIdx % PATTERN_COLORS.length];
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7;
                ctx.fillRect(b * barW + 1, headerH + 2, barW - 2, trackH - 4);
                ctx.globalAlpha = 1;

                // Border
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(b * barW + 1, headerH + 2, barW - 2, trackH - 4);

                // Pattern number label
                ctx.fillStyle = '#000';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(patIdx + 1), b * barW + barW / 2, headerH + trackH / 2);
            }
            ctx.textBaseline = 'alphabetic';

            // Playhead
            if (this.playing && this.playMode === 'song' && this.currentBar >= 0) {
                ctx.strokeStyle = '#00ff87';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.currentBar * barW, 0);
                ctx.lineTo(this.currentBar * barW, h);
                ctx.stroke();
            }

            // Highlight selected pattern in palette area (drawn at top-right as info)
            ctx.fillStyle = '#444466';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('Selected: P' + (this.arrangementSelectedPattern + 1), w - 5, 13);
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

            // Sample import
            document.getElementById('sample-import').addEventListener('change', (e) => this.handleSampleImport(e));

            // WAV export (Phase 5: full implementation)
            const btnExport = document.getElementById('btn-export');
            if (btnExport) {
                btnExport.addEventListener('click', () => this.exportWAV());
            }

            // Phase 5: Undo/Redo buttons
            const btnUndo = document.getElementById('btn-undo');
            const btnRedo = document.getElementById('btn-redo');
            if (btnUndo) {
                btnUndo.addEventListener('click', () => {
                    if (this.state.undo()) {
                        this.syncStepsDropdown();
                        this.buildStepIndicators();
                        this.buildSequencerGrid();
                        this.drawPianoRoll();
                        this.drawAutomation();
                        this.flashUndo();
                        this.setStatus('Undo');
                        this.autoSave();
                        this.updateUndoRedoButtons();
                    }
                });
            }
            if (btnRedo) {
                btnRedo.addEventListener('click', () => {
                    if (this.state.redo()) {
                        this.syncStepsDropdown();
                        this.buildStepIndicators();
                        this.buildSequencerGrid();
                        this.drawPianoRoll();
                        this.drawAutomation();
                        this.setStatus('Redo');
                        this.autoSave();
                        this.updateUndoRedoButtons();
                    }
                });
            }

            // Phase 5: Browse presets button
            const btnBrowse = document.getElementById('btn-browse-presets');
            if (btnBrowse) {
                btnBrowse.addEventListener('click', () => this.togglePresetBrowser());
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
                    this.updateMobilePianoVisibility();
                });
            });

            // Sequencer grid: drag-to-paint with pointer events
            const seqGrid = document.querySelector('.sequencer-grid');
            seqGrid.addEventListener('pointerdown', (e) => {
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
                    // Start drag-to-paint
                    this.state.pushUndo();
                    const stepData = this.state.getStep(ch, s);
                    this.dragPaintValue = !stepData.on;
                    this.dragPaintChannel = ch;
                    this.dragPainting = true;
                    this.dragPaintedSteps.clear();
                    stepData.on = this.dragPaintValue;
                    this.dragPaintedSteps.add(s);
                    this.updateStepDisplay(ch, s);
                    // Play sound preview when activating a step
                    if (this.dragPaintValue && !this.playing) {
                        (async () => {
                            await this.audio.init();
                            if (this.audio.ctx.state === 'suspended') {
                                await this.audio.ctx.resume();
                            }
                            this.audio.playChannel(ch, this.audio.ctx.currentTime + 0.01, stepData.velocity, stepData.note, stepData.open, 0.2);
                        })();
                    }
                    stepEl.setPointerCapture(e.pointerId);
                    e.preventDefault();
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

            seqGrid.addEventListener('pointermove', (e) => {
                if (!this.dragPainting) return;
                const el2 = document.elementFromPoint(e.clientX, e.clientY);
                if (!el2) return;
                const stepEl = el2.closest('.seq-step');
                if (!stepEl) return;
                const ch = parseInt(stepEl.dataset.channel);
                const s = parseInt(stepEl.dataset.step);
                if (ch !== this.dragPaintChannel) return;
                if (this.dragPaintedSteps.has(s)) return;
                const stepData = this.state.getStep(ch, s);
                stepData.on = this.dragPaintValue;
                this.dragPaintedSteps.add(s);
                this.updateStepDisplay(ch, s);
            });

            seqGrid.addEventListener('pointerup', (e) => {
                if (this.dragPainting) {
                    this.dragPainting = false;
                    this.dragPaintedSteps.clear();
                    this.autoSave();
                    this.updateUndoRedoButtons();
                }
            });

            // Phase 5: Sequencer right-click context menu
            document.querySelector('.sequencer-grid').addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const stepEl = e.target.closest('.seq-step');
                if (!stepEl) return;
                const ch = parseInt(stepEl.dataset.channel);
                const s = parseInt(stepEl.dataset.step);
                const stepData = this.state.getStep(ch, s);

                const items = [
                    { label: 'Set Velocity 25%', action: () => { stepData.velocity = 0.25; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                    { label: 'Set Velocity 50%', action: () => { stepData.velocity = 0.5; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                    { label: 'Set Velocity 75%', action: () => { stepData.velocity = 0.75; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                    { label: 'Set Velocity 100%', action: () => { stepData.velocity = 1.0; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                ];
                if (ch === 2) {
                    items.push({ label: 'separator' });
                    items.push({ label: 'Toggle Open Hat', action: () => {
                        if (stepData.on) { stepData.open = !stepData.open; this.updateStepDisplay(ch, s); this.autoSave(); }
                    }, disabled: !stepData.on });
                }
                items.push({ label: 'separator' });
                items.push({ label: 'Clear Step', action: () => {
                    this.state.pushUndo();
                    stepData.on = false;
                    stepData.open = false;
                    this.updateStepDisplay(ch, s);
                    this.autoSave();
                    this.updateUndoRedoButtons();
                }});
                this.showContextMenu(e.clientX, e.clientY, items);
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
                    } else if (e.target.dataset.busType) {
                        // Phase 4: Bus fader
                        const val = parseInt(e.target.value) / 100;
                        if (e.target.dataset.busType === 'drums') {
                            this.audio.setDrumBusVolume(val);
                        } else if (e.target.dataset.busType === 'synths') {
                            this.audio.setSynthBusVolume(val);
                        }
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
                // EQ ranges (also handles bus compressor knobs)
                if (e.target.classList.contains('mixer-eq-range')) {
                    if (e.target.dataset.busParam === 'compressor') {
                        // Phase 4: Bus compressor
                        const val = parseInt(e.target.value) / 100;
                        if (e.target.dataset.busType === 'drums') {
                            this.audio.setDrumBusCompressor(val);
                        } else if (e.target.dataset.busType === 'synths') {
                            this.audio.setSynthBusCompressor(val);
                        }
                    } else {
                        const ch = parseInt(e.target.dataset.channel);
                        const band = e.target.dataset.band;
                        const dB = parseFloat(e.target.value);
                        this.audio.setChannelEq(ch, band, dB);
                    }
                }
                // Send ranges
                if (e.target.classList.contains('mixer-send-range')) {
                    const ch = parseInt(e.target.dataset.channel);
                    const sendParam = e.target.dataset.sendParam;
                    const val = parseInt(e.target.value);
                    if (sendParam === 'reverbSend') {
                        this.audio.setChannelReverbSend(ch, val);
                    } else if (sendParam === 'delaySend') {
                        this.audio.setChannelDelaySend(ch, val);
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

            // Phase 4: New effects
            this.bindEffect('fx-chorus', v => this.audio.setChorus(v / 100), v => v + '%');
            this.bindEffect('fx-phaser', v => this.audio.setPhaser(v / 100), v => v + '%');
            this.bindEffect('fx-flanger', v => this.audio.setFlanger(v / 100), v => v + '%');
            this.bindEffect('fx-bitcrusher', v => this.audio.setBitcrusher(v / 100), v => v + '%');

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
                    this.updateSampleSection();
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
            const scSource = document.getElementById('sc-source');
            if (scSource) {
                scSource.addEventListener('change', (e) => {
                    this.audio.sidechainSource = parseInt(e.target.value);
                    this.autoSave();
                });
            }
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

            // Song mode / Arrangement buttons
            document.getElementById('btn-song-add').addEventListener('click', () => {
                // Add 4 bars
                for (let i = 0; i < 4; i++) {
                    this.state.arrangement.push(-1);
                }
                this.updateSongChainDisplay();
                this.autoSave();
            });
            document.getElementById('btn-song-remove').addEventListener('click', () => {
                if (this.state.arrangement.length > 0) {
                    // Remove last 4 bars (or remaining)
                    const removeCount = Math.min(4, this.state.arrangement.length);
                    this.state.arrangement.splice(this.state.arrangement.length - removeCount, removeCount);
                    this.updateSongChainDisplay();
                    this.autoSave();
                }
            });
            document.getElementById('btn-song-clear').addEventListener('click', () => {
                this.state.arrangement = [];
                this.currentBar = 0;
                this.updateSongChainDisplay();
                this.autoSave();
            });
            document.getElementById('song-loop').addEventListener('change', (e) => {
                this.songLoop = e.target.checked;
            });

            // Arrangement pattern palette clicks
            const arrPalette = document.getElementById('arrangement-palette');
            if (arrPalette) {
                arrPalette.addEventListener('click', (e) => {
                    const btn = e.target.closest('.arr-pat-btn');
                    if (!btn) return;
                    this.arrangementSelectedPattern = parseInt(btn.dataset.pattern);
                    arrPalette.querySelectorAll('.arr-pat-btn').forEach((b, i) => {
                        b.classList.toggle('active', i === this.arrangementSelectedPattern);
                    });
                    this.drawArrangement();
                });
            }

            // Arrangement canvas events
            if (this.arrangementCanvas) {
                this.arrangementCanvas.addEventListener('pointerdown', (e) => this.handleArrangementPointerDown(e));
                this.arrangementCanvas.addEventListener('pointermove', (e) => this.handleArrangementPointerMove(e));
                this.arrangementCanvas.addEventListener('pointerup', () => { this.arrangementPainting = false; });
                this.arrangementCanvas.addEventListener('pointerleave', () => { this.arrangementPainting = false; });
                this.arrangementCanvas.addEventListener('contextmenu', (e) => this.handleArrangementRightClick(e));
            }

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

            // Piano roll SEL button
            const selBtn = document.getElementById('btn-pr-select');
            if (selBtn) {
                selBtn.addEventListener('click', () => {
                    this.pianoRollSelMode = !this.pianoRollSelMode;
                    selBtn.classList.toggle('active', this.pianoRollSelMode);
                    if (!this.pianoRollSelMode) {
                        this.pianoRollSelection.active = false;
                        this.pianoRollSelecting = false;
                        this.drawPianoRoll();
                    }
                    this.setStatus('Piano roll select mode: ' + (this.pianoRollSelMode ? 'ON' : 'OFF'));
                });
            }

            // Humanize button
            const humBtn = document.getElementById('btn-pat-humanize');
            if (humBtn) {
                humBtn.addEventListener('click', () => this.humanizePattern());
            }

            // Help button
            const helpBtn = document.getElementById('btn-help');
            if (helpBtn) {
                helpBtn.addEventListener('click', () => this.toggleHelpModal());
            }

            // Piano roll canvas mouse events for note duration drag and velocity editing
            if (this.pianoCanvas) {
                this.pianoCanvas.addEventListener('pointerdown', (e) => this.handlePianoRollMouseDown(e));
                this.pianoCanvas.addEventListener('pointermove', (e) => this.handlePianoRollMouseMove(e));
                this.pianoCanvas.addEventListener('pointerup', (e) => this.handlePianoRollMouseUp(e));
                this.pianoCanvas.addEventListener('pointerleave', (e) => this.handlePianoRollMouseUp(e));
                this.pianoCanvas.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.handlePianoRollContextMenu(e);
                });
                // Phase 5: Zoom with Ctrl+Wheel, scroll with Shift+Wheel
                this.pianoCanvas.addEventListener('wheel', (e) => this.handlePianoRollWheel(e), { passive: false });
            }

            // Phase 5: Zoom buttons
            const btnZoomIn = document.getElementById('btn-zoom-in');
            const btnZoomOut = document.getElementById('btn-zoom-out');
            if (btnZoomIn) {
                btnZoomIn.addEventListener('click', () => {
                    this.pianoRollZoom = Math.min(3.0, this.pianoRollZoom + 0.25);
                    this.updatePianoRollZoom();
                });
            }
            if (btnZoomOut) {
                btnZoomOut.addEventListener('click', () => {
                    this.pianoRollZoom = Math.max(0.5, this.pianoRollZoom - 0.25);
                    this.updatePianoRollZoom();
                });
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
                this.automationCanvas.addEventListener('pointerdown', (e) => this.handleAutomationMouseDown(e));
                this.automationCanvas.addEventListener('pointermove', (e) => this.handleAutomationMouseMove(e));
                this.automationCanvas.addEventListener('pointerup', () => { this.automationDragging = false; });
                this.automationCanvas.addEventListener('pointerleave', () => { this.automationDragging = false; });
                this.automationCanvas.addEventListener('contextmenu', (e) => this.handleAutomationRightClick(e));
            }

            // Keyboard events
            document.addEventListener('keydown', (e) => this.handleKeyDown(e));
            document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        }

        // ---- Sample Import Handler ----
        async handleSampleImport(e) {
            const file = e.target.files[0];
            if (!file) return;
            const ch = parseInt(e.target.dataset.targetChannel || this.synthEditorChannel);

            try {
                await this.audio.init();
                await this.audio.sampleManager.loadSample(this.audio.ctx, ch, file);
                this.updateSampleSection();
                this.setStatus('Sample loaded: ' + file.name + ' -> ' + CHANNELS[ch].name);
            } catch (err) {
                this.setStatus('Sample load failed: ' + err.message);
            }
            // Reset so same file can be loaded again
            e.target.value = '';
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
                    this.updateUndoRedoButtons();
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
                    this.updateUndoRedoButtons();
                }
                return;
            }

            // Ctrl+S: save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveProject();
                return;
            }

            // Ctrl+C: copy (piano roll selection or pattern)
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                if (this.activeTab === 'pianoroll' && this.pianoRollSelMode && this.pianoRollSelection.active) {
                    this.copyPianoRollSelection();
                } else {
                    this.state.copyPattern();
                    this.setStatus('Pattern copied');
                }
                return;
            }

            // Ctrl+V: paste (piano roll selection or pattern)
            if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                if (this.activeTab === 'pianoroll' && this.pianoRollSelMode && this.pianoRollNoteClipboard) {
                    this.pastePianoRollSelection();
                } else if (this.state.pastePattern()) {
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

            // Delete: delete selected notes in piano roll
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.activeTab === 'pianoroll' && this.pianoRollSelMode && this.pianoRollSelection.active) {
                    e.preventDefault();
                    this.deletePianoRollSelection();
                    return;
                }
            }

            // Escape: close modals or stop
            if (e.key === 'Escape') {
                if (this.activeContextMenu) {
                    this.closeContextMenu();
                } else if (this.presetBrowserOpen) {
                    this.togglePresetBrowser();
                } else if (this.helpModalOpen) {
                    this.toggleHelpModal();
                } else {
                    this.stop();
                }
                return;
            }

            // ?: help modal
            if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                this.toggleHelpModal();
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
            this.currentBar = 0;

            // If song mode, load first pattern from arrangement
            if (this.playMode === 'song') {
                const arr = this.state.arrangement;
                if (arr.length > 0) {
                    // Find first non-empty bar
                    let firstPat = -1;
                    for (let i = 0; i < arr.length; i++) {
                        if (arr[i] >= 0) {
                            firstPat = arr[i];
                            this.currentBar = i;
                            break;
                        }
                    }
                    if (firstPat >= 0) {
                        this.state.currentPattern = firstPat;
                        this.updatePatternButtons();
                    }
                } else if (this.state.songChain.length > 0) {
                    // Fallback to legacy songChain
                    this.state.currentPattern = this.state.songChain[0];
                    this.updatePatternButtons();
                }
            }

            this.scheduler();
            document.getElementById('btn-play').classList.add('active');
            this.updateFabPlayState();
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
            this.updateFabPlayState();
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
                if (this.currentStep === steps - 1 && this.playMode === 'song') {
                    const arr = this.state.arrangement;
                    if (arr.length > 0) {
                        // Advance using arrangement
                        let nextBar = this.currentBar + 1;
                        // Skip empty bars
                        while (nextBar < arr.length && arr[nextBar] < 0) nextBar++;

                        if (nextBar >= arr.length) {
                            if (this.songLoop) {
                                nextBar = 0;
                                while (nextBar < arr.length && arr[nextBar] < 0) nextBar++;
                                if (nextBar >= arr.length) {
                                    setTimeout(() => this.stop(), (this.nextStepTime - this.audio.ctx.currentTime) * 1000);
                                    nextBar = -1;
                                }
                            } else {
                                setTimeout(() => this.stop(), (this.nextStepTime - this.audio.ctx.currentTime) * 1000);
                                nextBar = -1;
                            }
                        }
                        if (nextBar >= 0 && nextBar < arr.length) {
                            this.currentBar = nextBar;
                            this.state.currentPattern = arr[nextBar];
                            setTimeout(() => {
                                this.updatePatternButtons();
                                this.syncStepsDropdown();
                                this.buildStepIndicators();
                                this.buildSequencerGrid();
                                this.drawArrangement();
                            }, uiDelay);
                        }
                    } else if (this.state.songChain.length > 0) {
                        // Fallback to legacy songChain
                        this.songChainIndex++;
                        if (this.songChainIndex >= this.state.songChain.length) {
                            if (this.songLoop) {
                                this.songChainIndex = 0;
                            } else {
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
                if (ch >= channels.length) break; // Safety for backward compat
                const stepData = channels[ch][step];
                if (stepData && stepData.on) {
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
            const zoom = this.pianoRollZoom;
            const virtualW = Math.round(800 * zoom);
            this.pianoCanvas.width = virtualW;
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
            if (ch >= channels.length) return; // Safety
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

            // Selection rectangle (Phase 3)
            if (this.pianoRollSelMode && this.pianoRollSelection.active) {
                const sel = this.pianoRollSelection;
                const minStep = Math.min(sel.startStep, sel.endStep);
                const maxStep = Math.max(sel.startStep, sel.endStep);
                const minNote = Math.min(sel.startNote, sel.endNote);
                const maxNote = Math.max(sel.startNote, sel.endNote);
                const minNoteOffset = minNote - baseNote;
                const maxNoteOffset = maxNote - baseNote;

                if (maxNoteOffset >= 0 && minNoteOffset < rows) {
                    const selY1 = (rows - 1 - Math.min(maxNoteOffset, rows - 1)) * rowH;
                    const selY2 = (rows - Math.max(minNoteOffset, 0)) * rowH;
                    const selX1 = minStep * colW;
                    const selX2 = (maxStep + 1) * colW;

                    ctx.save();
                    ctx.strokeStyle = '#4fc3f7';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(selX1, selY1, selX2 - selX1, selY2 - selY1);
                    ctx.fillStyle = 'rgba(79, 195, 247, 0.08)';
                    ctx.fillRect(selX1, selY1, selX2 - selX1, selY2 - selY1);
                    ctx.restore();
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

            // Track last click position for paste offset
            this.pianoRollLastClickStep = step;
            this.pianoRollLastClickNote = midiNote;

            // Selection mode
            if (this.pianoRollSelMode) {
                this.pianoRollSelecting = true;
                this.pianoRollSelection = {
                    active: true,
                    startStep: step, startNote: midiNote,
                    endStep: step, endNote: midiNote
                };
                this.drawPianoRoll();
                return;
            }

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

            // Selection drag
            if (this.pianoRollSelecting) {
                const rect = this.pianoCanvas.getBoundingClientRect();
                const canvasX = (e.clientX - rect.left) * (this.pianoCanvas.width / rect.width);
                const canvasY = (e.clientY - rect.top) * (this.pianoCanvas.height / rect.height);
                const noteAreaH = 480;
                const rows = 24;
                const rowH = noteAreaH / rows;
                const steps = this.state.getSteps();
                const colW = this.pianoCanvas.width / steps;
                const step = Math.max(0, Math.min(steps - 1, Math.floor(canvasX / colW)));
                const row = Math.floor(canvasY / rowH);
                const noteOffset = rows - 1 - row;
                const baseNote = (this.pianoRollOctave + 1) * 12;
                const midiNote = Math.max(0, Math.min(127, baseNote + noteOffset));
                this.pianoRollSelection.endStep = step;
                this.pianoRollSelection.endNote = midiNote;
                this.drawPianoRoll();
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

            if (this.pianoRollSelecting) {
                this.pianoRollSelecting = false;
                this.drawPianoRoll();
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
                version: 5,
                bpm: this.bpm,
                swing: this.swing,
                patterns: JSON.parse(JSON.stringify(this.state.patterns)),
                currentPattern: this.state.currentPattern,
                songChain: [...this.state.songChain],
                arrangement: [...this.state.arrangement],
                channelParams: JSON.parse(JSON.stringify(this.audio.channelParams)),
                sidechainAmount: this.audio.sidechainAmount,
                sidechainRelease: this.audio.sidechainRelease,
                sidechainSource: this.audio.sidechainSource,
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
                // Handle v2 -> v3/v4 migration
                if (version <= 2) {
                    // v2 patterns are flat arrays (pattern = array of channels, each channel = array of steps)
                    const migratedPatterns = [];
                    for (let p = 0; p < data.patterns.length; p++) {
                        const oldPat = data.patterns[p];
                        // Check if already in v3 format (has stepsCount property)
                        if (oldPat && oldPat.stepsCount !== undefined) {
                            // Already v3 format, just ensure duration and automation exist
                            for (let ch = 0; ch < oldPat.channels.length; ch++) {
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

                // Ensure all patterns have the new structure and extend channels to 11
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

                    // Extend from 8 channels to 11 if needed (backward compat)
                    while (pat.channels.length < CHANNELS.length) {
                        const chIdx = pat.channels.length;
                        const channel = [];
                        for (let s = 0; s < pat.stepsCount; s++) {
                            channel.push({
                                on: false,
                                velocity: 0.8,
                                note: CHANNELS[chIdx].type === 'synth' ? 48 : 0,
                                open: false,
                                duration: 1
                            });
                        }
                        pat.channels.push(channel);
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
            if (data.arrangement) {
                this.state.arrangement = data.arrangement;
            }
            if (data.channelParams) {
                this.audio.channelParams = data.channelParams;
                // Extend channelParams if saved with fewer channels
                while (this.audio.channelParams.length < CHANNELS.length) {
                    const i = this.audio.channelParams.length;
                    if (CHANNELS[i].type === 'drum') {
                        this.audio.channelParams.push({
                            tune: 0, decay: 50, tone: 50, drive: 0,
                            eqLow: 0, eqMid: 0, eqHigh: 0,
                            reverbSend: 20, delaySend: 0
                        });
                    } else {
                        const base = {
                            waveform: 'sawtooth', attack: 10, decay: 50,
                            cutoff: 70, resonance: 5, detune: 5, glide: 0,
                            eqLow: 0, eqMid: 0, eqHigh: 0,
                            reverbSend: 20, delaySend: 0
                        };
                        if (i === 8) base.chordType = 'minor';
                        this.audio.channelParams.push(base);
                    }
                }
                // Ensure existing params have new Phase 2 defaults
                for (let i = 0; i < this.audio.channelParams.length; i++) {
                    const p = this.audio.channelParams[i];
                    if (p.eqLow === undefined) p.eqLow = 0;
                    if (p.eqMid === undefined) p.eqMid = 0;
                    if (p.eqHigh === undefined) p.eqHigh = 0;
                    if (p.reverbSend === undefined) p.reverbSend = 20;
                    if (p.delaySend === undefined) p.delaySend = 0;
                    if (CHANNELS[i] && CHANNELS[i].type === 'synth') {
                        if (p.glide === undefined) p.glide = 0;
                    }
                    if (i === 8 && p.chordType === undefined) {
                        p.chordType = 'minor';
                    }
                }
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
            if (typeof data.sidechainSource === 'number') {
                this.audio.sidechainSource = data.sidechainSource;
                const ssEl = document.getElementById('sc-source');
                if (ssEl) ssEl.value = data.sidechainSource;
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
            this.updateSampleSection();
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
                // Redraw arrangement playhead
                if (this.activeTab === 'songmode') {
                    this.drawArrangement();
                }
            };

            draw();
        }

        // ---- Arrangement Canvas Events ----
        handleArrangementPointerDown(e) {
            if (e.button === 2) return; // right click handled separately
            const rect = this.arrangementCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.arrangementCanvas.width / rect.width);
            const totalBars = Math.max(this.state.arrangement.length, 16);
            const barW = this.arrangementCanvas.width / totalBars;
            const bar = Math.floor(x / barW);
            if (bar < 0 || bar >= totalBars) return;

            // Ensure arrangement is long enough
            while (this.state.arrangement.length <= bar) {
                this.state.arrangement.push(-1);
            }

            this.state.arrangement[bar] = this.arrangementSelectedPattern;
            this.arrangementPainting = true;
            this.drawArrangement();
            this.autoSave();
            this.updateSongChainDisplay();
            e.preventDefault();
        }

        handleArrangementPointerMove(e) {
            if (!this.arrangementPainting) return;
            const rect = this.arrangementCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.arrangementCanvas.width / rect.width);
            const totalBars = Math.max(this.state.arrangement.length, 16);
            const barW = this.arrangementCanvas.width / totalBars;
            const bar = Math.floor(x / barW);
            if (bar < 0 || bar >= totalBars) return;

            while (this.state.arrangement.length <= bar) {
                this.state.arrangement.push(-1);
            }

            this.state.arrangement[bar] = this.arrangementSelectedPattern;
            this.drawArrangement();
            this.autoSave();
        }

        handleArrangementRightClick(e) {
            e.preventDefault();
            const rect = this.arrangementCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.arrangementCanvas.width / rect.width);
            const totalBars = Math.max(this.state.arrangement.length, 16);
            const barW = this.arrangementCanvas.width / totalBars;
            const bar = Math.floor(x / barW);
            if (bar < 0 || bar >= this.state.arrangement.length) return;

            this.state.arrangement[bar] = -1;
            this.drawArrangement();
            this.autoSave();
            this.updateSongChainDisplay();
        }

        // ---- Humanize ----
        humanizePattern() {
            this.state.pushUndo();
            const pat = this.state.getCurrentPattern();
            const steps = pat.stepsCount;
            let count = 0;
            for (let ch = 0; ch < CHANNELS.length; ch++) {
                for (let s = 0; s < steps; s++) {
                    const stepData = pat.channels[ch][s];
                    if (stepData.on) {
                        const offset = (Math.random() * 0.2) - 0.1;
                        stepData.velocity = Math.max(0.2, Math.min(1.0, stepData.velocity + offset));
                        stepData.velocity = Math.round(stepData.velocity * 100) / 100;
                        count++;
                    }
                }
            }
            this.updateSequencerDisplay();
            this.drawPianoRoll();
            this.autoSave();
            this.setStatus('Humanized pattern ' + (this.state.currentPattern + 1) + ' (' + count + ' steps)');
        }

        // ---- Piano Roll Copy/Paste ----
        copyPianoRollSelection() {
            const sel = this.pianoRollSelection;
            if (!sel.active) {
                this.setStatus('No selection to copy');
                return;
            }
            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const steps = this.state.getSteps();
            const minStep = Math.min(sel.startStep, sel.endStep);
            const maxStep = Math.max(sel.startStep, sel.endStep);
            const minNote = Math.min(sel.startNote, sel.endNote);
            const maxNote = Math.max(sel.startNote, sel.endNote);

            const notes = [];
            for (let s = minStep; s <= maxStep && s < steps; s++) {
                const stepData = channels[ch][s];
                if (stepData.on && stepData.note >= minNote && stepData.note <= maxNote) {
                    notes.push({
                        step: s - minStep,
                        note: stepData.note - minNote,
                        velocity: stepData.velocity,
                        duration: stepData.duration || 1
                    });
                }
            }
            this.pianoRollNoteClipboard = { notes: notes, baseStep: minStep, baseNote: minNote };
            this.setStatus('Copied ' + notes.length + ' notes');
        }

        pastePianoRollSelection() {
            if (!this.pianoRollNoteClipboard || this.pianoRollNoteClipboard.notes.length === 0) {
                this.setStatus('Nothing to paste');
                return;
            }
            this.state.pushUndo();
            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const steps = this.state.getSteps();
            const clip = this.pianoRollNoteClipboard;
            const offsetStep = this.pianoRollLastClickStep;
            const offsetNote = this.pianoRollLastClickNote;
            let pasted = 0;

            for (const n of clip.notes) {
                const targetStep = offsetStep + n.step;
                const targetNote = offsetNote + n.note;
                if (targetStep >= 0 && targetStep < steps && targetNote >= 0 && targetNote <= 127) {
                    const stepData = channels[ch][targetStep];
                    stepData.on = true;
                    stepData.note = targetNote;
                    stepData.velocity = n.velocity;
                    stepData.duration = n.duration;
                    pasted++;
                }
            }
            this.updateSequencerDisplay();
            this.drawPianoRoll();
            this.autoSave();
            this.setStatus('Pasted ' + pasted + ' notes');
        }

        deletePianoRollSelection() {
            const sel = this.pianoRollSelection;
            if (!sel.active) return;
            this.state.pushUndo();
            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const steps = this.state.getSteps();
            const minStep = Math.min(sel.startStep, sel.endStep);
            const maxStep = Math.max(sel.startStep, sel.endStep);
            const minNote = Math.min(sel.startNote, sel.endNote);
            const maxNote = Math.max(sel.startNote, sel.endNote);
            let deleted = 0;

            for (let s = minStep; s <= maxStep && s < steps; s++) {
                const stepData = channels[ch][s];
                if (stepData.on && stepData.note >= minNote && stepData.note <= maxNote) {
                    stepData.on = false;
                    deleted++;
                }
            }
            this.pianoRollSelection.active = false;
            this.updateSequencerDisplay();
            this.drawPianoRoll();
            this.autoSave();
            this.setStatus('Deleted ' + deleted + ' notes');
        }

        // ---- Help Modal ----
        toggleHelpModal() {
            this.helpModalOpen = !this.helpModalOpen;
            let modal = document.getElementById('help-modal');
            if (this.helpModalOpen) {
                if (!modal) {
                    modal = this.buildHelpModal();
                    document.getElementById('app').appendChild(modal);
                }
                modal.style.display = 'flex';
            } else {
                if (modal) modal.style.display = 'none';
            }
        }

        buildHelpModal() {
            const overlay = el('div', { id: 'help-modal', className: 'help-modal-overlay' });
            const card = el('div', { className: 'help-modal-card' });

            const title = el('h2', { className: 'help-modal-title', text: 'Keyboard Shortcuts' });
            card.appendChild(title);

            const sections = [
                { title: 'Transport', shortcuts: [
                    ['Space', 'Play / Stop'],
                    ['Esc', 'Stop'],
                    ['T', 'Tap Tempo']
                ]},
                { title: 'Pattern', shortcuts: [
                    ['1-8', 'Select Pattern'],
                    ['Ctrl+C', 'Copy Pattern'],
                    ['Ctrl+V', 'Paste Pattern'],
                    ['Ctrl+S', 'Save Project']
                ]},
                { title: 'Piano Roll', shortcuts: [
                    ['Z-M', 'Play Notes'],
                    ['Shift', 'Octave Up'],
                    ['Click', 'Place Note'],
                    ['Drag', 'Extend Note Duration'],
                    ['SEL mode + Drag', 'Select Notes'],
                    ['Delete', 'Delete Selected Notes']
                ]},
                { title: 'Editing', shortcuts: [
                    ['Ctrl+Z', 'Undo'],
                    ['Ctrl+Shift+Z', 'Redo'],
                    ['Shift+Click (HiHat)', 'Toggle Open Hat'],
                    ['Drag (Sequencer)', 'Paint Steps']
                ]},
                { title: 'Navigation', shortcuts: [
                    ['?', 'Toggle This Help']
                ]}
            ];

            for (const sec of sections) {
                const secTitle = el('h3', { className: 'help-section-title', text: sec.title });
                card.appendChild(secTitle);
                const grid = el('div', { className: 'help-shortcut-grid' });
                for (const [key, desc] of sec.shortcuts) {
                    const keyEl = el('span', { className: 'help-key', text: key });
                    const descEl = el('span', { className: 'help-desc', text: desc });
                    grid.appendChild(keyEl);
                    grid.appendChild(descEl);
                }
                card.appendChild(grid);
            }

            const closeBtn = el('button', { className: 'help-close-btn', text: 'Close (?)' });
            closeBtn.addEventListener('click', () => this.toggleHelpModal());
            card.appendChild(closeBtn);

            overlay.appendChild(card);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.toggleHelpModal();
            });

            return overlay;
        }

        // ---- Phase 5: Undo/Redo Button State ----
        updateUndoRedoButtons() {
            const btnUndo = document.getElementById('btn-undo');
            const btnRedo = document.getElementById('btn-redo');
            if (btnUndo) {
                btnUndo.classList.toggle('disabled', this.state.undoStack.length === 0);
            }
            if (btnRedo) {
                btnRedo.classList.toggle('disabled', this.state.redoStack.length === 0);
            }
        }

        // ---- Phase 5: Context Menu ----
        showContextMenu(x, y, items) {
            this.closeContextMenu();
            const menu = el('div', { className: 'context-menu' });
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';

            for (const item of items) {
                if (item.label === 'separator') {
                    menu.appendChild(el('div', { className: 'context-menu-separator' }));
                    continue;
                }
                const btn = el('button', {
                    className: 'context-menu-item' + (item.disabled ? ' disabled' : ''),
                    text: item.label
                });
                if (!item.disabled && item.action) {
                    btn.addEventListener('click', () => {
                        item.action();
                        this.closeContextMenu();
                    });
                }
                menu.appendChild(btn);
            }

            document.body.appendChild(menu);
            this.activeContextMenu = menu;

            // Adjust position if off-screen
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (x - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (y - rect.height) + 'px';
            }

            // Close on click outside
            const closeHandler = (e) => {
                if (!menu.contains(e.target)) {
                    this.closeContextMenu();
                    document.removeEventListener('mousedown', closeHandler);
                }
            };
            setTimeout(() => {
                document.addEventListener('mousedown', closeHandler);
            }, 0);
        }

        closeContextMenu() {
            if (this.activeContextMenu) {
                this.activeContextMenu.remove();
                this.activeContextMenu = null;
            }
        }

        // ---- Phase 5: Piano Roll Context Menu ----
        handlePianoRollContextMenu(e) {
            const rect = this.pianoCanvas.getBoundingClientRect();
            const scaleX = this.pianoCanvas.width / rect.width;
            const scaleY = this.pianoCanvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            const noteAreaH = 480;
            const rows = 24;
            const rowH = noteAreaH / rows;
            const steps = this.state.getSteps();
            const colW = this.pianoCanvas.width / steps;

            if (canvasY > noteAreaH) return; // velocity lane

            const step = Math.floor(canvasX / colW);
            const row = Math.floor(canvasY / rowH);
            const noteOffset = rows - 1 - row;
            const baseNote = (this.pianoRollOctave + 1) * 12;
            const midiNote = baseNote + noteOffset;
            if (step < 0 || step >= steps) return;

            const channels = this.state.getCurrentPatternChannels();
            const ch = this.pianoRollChannel;
            const stepData = channels[ch][step];
            const hasNote = stepData.on && stepData.note === midiNote;

            const items = [];
            if (hasNote) {
                items.push({ label: 'Delete Note', action: () => {
                    this.state.pushUndo();
                    stepData.on = false;
                    this.updateStepDisplay(ch, step);
                    this.drawPianoRoll();
                    this.autoSave();
                    this.updateUndoRedoButtons();
                }});
                items.push({ label: 'separator' });
                items.push({ label: 'Velocity 25%', action: () => { stepData.velocity = 0.25; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'Velocity 50%', action: () => { stepData.velocity = 0.5; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'Velocity 75%', action: () => { stepData.velocity = 0.75; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'Velocity 100%', action: () => { stepData.velocity = 1.0; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'separator' });
                items.push({ label: 'Duration 1 step', action: () => { stepData.duration = 1; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'Duration 2 steps', action: () => { stepData.duration = 2; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'Duration 4 steps', action: () => { stepData.duration = 4; this.drawPianoRoll(); this.autoSave(); }});
                items.push({ label: 'Duration 8 steps', action: () => { stepData.duration = 8; this.drawPianoRoll(); this.autoSave(); }});
            } else {
                items.push({ label: 'No note here', disabled: true });
            }

            this.showContextMenu(e.clientX, e.clientY, items);
        }

        // ---- Phase 5: Piano Roll Zoom ----
        updatePianoRollZoom() {
            const display = document.getElementById('zoom-display');
            if (display) display.textContent = Math.round(this.pianoRollZoom * 100) + '%';
            this.drawPianoRoll();
        }

        handlePianoRollWheel(e) {
            if (e.ctrlKey) {
                // Zoom
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.25 : 0.25;
                this.pianoRollZoom = Math.max(0.5, Math.min(3.0, this.pianoRollZoom + delta));
                this.updatePianoRollZoom();
            } else if (e.shiftKey) {
                // Horizontal scroll
                e.preventDefault();
                const wrapper = document.getElementById('pianoroll-canvas-wrapper');
                if (wrapper) {
                    wrapper.scrollLeft += e.deltaY;
                }
            }
        }

        // ---- Phase 5: Preset Browser ----
        togglePresetBrowser() {
            this.presetBrowserOpen = !this.presetBrowserOpen;
            let modal = document.getElementById('preset-browser-modal');
            if (this.presetBrowserOpen) {
                if (modal) modal.remove();
                modal = this.buildPresetBrowser();
                document.getElementById('app').appendChild(modal);
            } else {
                if (modal) modal.remove();
            }
        }

        buildPresetBrowser() {
            const overlay = el('div', { id: 'preset-browser-modal', className: 'preset-browser-overlay' });

            const card = el('div', { className: 'preset-browser-card' });

            // Header
            const header = el('div', { className: 'preset-browser-header' });
            const title = el('span', { className: 'preset-browser-title', text: 'PRESET BROWSER' });
            const closeBtn = el('button', { className: 'preset-browser-close', text: 'X' });
            closeBtn.addEventListener('click', () => this.togglePresetBrowser());
            header.appendChild(title);
            header.appendChild(closeBtn);
            card.appendChild(header);

            // Search
            const searchInput = el('input', { className: 'preset-browser-search', type: 'text', placeholder: 'Search presets...' });
            card.appendChild(searchInput);

            // Tags
            const allTags = new Set();
            for (const meta of Object.values(PRESET_META)) {
                for (const tag of meta.tags) allTags.add(tag);
            }
            // Also check user presets
            const userPresets = this.getUserPresets();
            for (const up of Object.values(userPresets)) {
                if (up.tags) {
                    for (const tag of up.tags) allTags.add(tag);
                }
            }
            const sortedTags = Array.from(allTags).sort();

            const tagContainer = el('div', { className: 'preset-browser-tags' });
            const activeTagsSet = new Set();

            for (const tag of sortedTags) {
                const tagBtn = el('button', { className: 'preset-tag-btn', text: tag });
                tagBtn.addEventListener('click', () => {
                    if (activeTagsSet.has(tag)) {
                        activeTagsSet.delete(tag);
                        tagBtn.classList.remove('active');
                    } else {
                        activeTagsSet.add(tag);
                        tagBtn.classList.add('active');
                    }
                    filterPresets();
                });
                tagContainer.appendChild(tagBtn);
            }
            card.appendChild(tagContainer);

            // List
            const list = el('div', { className: 'preset-browser-list' });
            card.appendChild(list);

            // Footer (save user preset)
            const footer = el('div', { className: 'preset-browser-footer' });
            const saveInput = el('input', { className: 'preset-save-input', type: 'text', placeholder: 'Name for new user preset...' });
            const saveBtn = el('button', { className: 'preset-save-btn', text: 'SAVE AS PRESET' });
            saveBtn.addEventListener('click', () => {
                const name = saveInput.value.trim();
                if (!name) return;
                this.saveUserPreset(name);
                saveInput.value = '';
                filterPresets(); // Refresh list
            });
            footer.appendChild(saveInput);
            footer.appendChild(saveBtn);
            card.appendChild(footer);

            overlay.appendChild(card);

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.togglePresetBrowser();
            });

            const filterPresets = () => {
                while (list.firstChild) list.removeChild(list.firstChild);
                const query = searchInput.value.toLowerCase().trim();

                // Built-in presets
                const builtInTitle = el('div', { className: 'preset-browser-section-title', text: 'BUILT-IN PRESETS' });
                list.appendChild(builtInTitle);

                let builtInCount = 0;
                for (const [presetName, presetData] of Object.entries(PRESETS)) {
                    const meta = PRESET_META[presetName] || { artist: 'Unknown', tags: [], description: '' };
                    if (!this.presetMatchesFilter(presetName, meta, query, activeTagsSet)) continue;
                    builtInCount++;
                    const item = this.buildPresetBrowserItem(presetName, meta, () => {
                        this.loadPreset(presetName);
                        // Also update the select dropdown
                        const sel = document.getElementById('preset-select');
                        if (sel) sel.value = presetName;
                        this.togglePresetBrowser();
                    });
                    list.appendChild(item);
                }
                if (builtInCount === 0) {
                    list.appendChild(el('div', { className: 'preset-browser-item', style: { color: 'var(--text-muted)', cursor: 'default' } }, [
                        el('span', { text: 'No matching presets' })
                    ]));
                }

                // User presets
                const currentUserPresets = this.getUserPresets();
                const userKeys = Object.keys(currentUserPresets);
                if (userKeys.length > 0) {
                    const userTitle = el('div', { className: 'preset-browser-section-title', text: 'USER PRESETS' });
                    list.appendChild(userTitle);

                    for (const upName of userKeys) {
                        const upData = currentUserPresets[upName];
                        const upMeta = { artist: 'User', tags: upData.tags || [], description: upData.description || 'User-saved preset' };
                        if (!this.presetMatchesFilter(upName, upMeta, query, activeTagsSet)) continue;
                        const item = this.buildPresetBrowserItem(upName, upMeta, () => {
                            this.loadUserPreset(upName);
                            this.togglePresetBrowser();
                        });
                        list.appendChild(item);
                    }
                }
            };

            searchInput.addEventListener('input', filterPresets);

            // Initial render
            filterPresets();

            // Focus search on open
            setTimeout(() => searchInput.focus(), 50);

            return overlay;
        }

        presetMatchesFilter(name, meta, query, activeTagsSet) {
            // Tag filter
            if (activeTagsSet.size > 0) {
                const hasMatchingTag = meta.tags.some(t => activeTagsSet.has(t));
                if (!hasMatchingTag) return false;
            }
            // Text search
            if (query) {
                const searchStr = (name + ' ' + meta.artist + ' ' + meta.tags.join(' ') + ' ' + meta.description).toLowerCase();
                if (!searchStr.includes(query)) return false;
            }
            return true;
        }

        buildPresetBrowserItem(presetName, meta, onClickFn) {
            const item = el('div', { className: 'preset-browser-item' });
            const topRow = el('div', { className: 'preset-browser-item-top' });
            // Format display name
            const displayName = presetName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            topRow.appendChild(el('span', { className: 'preset-browser-item-name', text: displayName }));
            topRow.appendChild(el('span', { className: 'preset-browser-item-artist', text: meta.artist }));
            item.appendChild(topRow);
            if (meta.description) {
                item.appendChild(el('span', { className: 'preset-browser-item-desc', text: meta.description }));
            }
            if (meta.tags && meta.tags.length > 0) {
                const tagsRow = el('div', { className: 'preset-browser-item-tags' });
                for (const tag of meta.tags) {
                    tagsRow.appendChild(el('span', { className: 'preset-item-tag', text: tag }));
                }
                item.appendChild(tagsRow);
            }
            item.addEventListener('click', onClickFn);
            return item;
        }

        // ---- Phase 5: User Presets ----
        getUserPresets() {
            try {
                const data = localStorage.getItem('funkybeats-user-presets');
                return data ? JSON.parse(data) : {};
            } catch (e) {
                return {};
            }
        }

        saveUserPreset(name) {
            const presets = this.getUserPresets();
            const projectData = this.serializeProject();
            presets[name] = {
                data: projectData,
                tags: ['user'],
                description: 'Saved at ' + new Date().toLocaleString()
            };
            try {
                localStorage.setItem('funkybeats-user-presets', JSON.stringify(presets));
                this.setStatus('User preset saved: ' + name);
            } catch (e) {
                this.setStatus('Failed to save user preset: ' + e.message);
            }
        }

        loadUserPreset(name) {
            const presets = this.getUserPresets();
            if (!presets[name] || !presets[name].data) return;
            this.deserializeProject(presets[name].data);
            this.setStatus('Loaded user preset: ' + name);
        }

        // ---- Phase 5: MIDI Input ----
        initMIDI() {
            if (!navigator.requestMIDIAccess) {
                return; // MIDI not available
            }
            navigator.requestMIDIAccess().then(
                (midiAccess) => {
                    this.midiAccess = midiAccess;
                    this.midiConnected = true;
                    const statusEl = document.getElementById('midi-status');
                    if (statusEl) {
                        statusEl.textContent = 'MIDI: Connected';
                        statusEl.classList.add('connected');
                    }

                    // Listen on all inputs
                    for (const input of midiAccess.inputs.values()) {
                        input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
                    }

                    // Handle hotplug
                    midiAccess.onstatechange = () => {
                        for (const input of midiAccess.inputs.values()) {
                            input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
                        }
                    };
                },
                () => {
                    // MIDI access denied or not available
                }
            );
        }

        handleMIDIMessage(msg) {
            const data = msg.data;
            const status = data[0] & 0xf0;
            const note = data[1];
            const velocity = data[2];

            // Note-on
            if (status === 0x90 && velocity > 0) {
                // Preview the note on the current piano roll channel
                this.audio.previewNote(this.pianoRollChannel, note);

                // If recording + playing: insert note at current step
                if (this.playing && this.recording && this.currentStep >= 0) {
                    const channels = this.state.getCurrentPatternChannels();
                    const ch = this.pianoRollChannel;
                    const stepData = channels[ch][this.currentStep];
                    stepData.on = true;
                    stepData.note = note;
                    stepData.velocity = velocity / 127;
                    this.updateStepDisplay(ch, this.currentStep);
                    this.drawPianoRoll();
                    this.autoSave();
                }
            }
            // Note-off (ignored for now as per spec)
        }

        // ---- Phase 5: WAV Export ----
        async exportWAV() {
            await this.audio.init();
            const sampleRate = 44100;
            const bpm = this.bpm;
            const stepDuration = 60 / bpm / 4;

            // Determine what to export
            let totalSteps;
            let patternSequence = []; // array of {patternIdx, stepsCount}

            if (this.playMode === 'song' && this.state.arrangement.length > 0) {
                // Song mode: export full arrangement
                const arr = this.state.arrangement;
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i] >= 0) {
                        const pat = this.state.patterns[arr[i]];
                        patternSequence.push({ patternIdx: arr[i], stepsCount: pat.stepsCount });
                    }
                }
                if (patternSequence.length === 0) {
                    this.setStatus('No patterns in arrangement to export');
                    return;
                }
            } else {
                // Pattern mode: repeat current pattern 4x
                const pat = this.state.getCurrentPattern();
                for (let r = 0; r < 4; r++) {
                    patternSequence.push({ patternIdx: this.state.currentPattern, stepsCount: pat.stepsCount });
                }
            }

            totalSteps = patternSequence.reduce((sum, p) => sum + p.stepsCount, 0);
            const totalDuration = totalSteps * stepDuration + 2; // +2 sec tail
            const totalFrames = Math.ceil(totalDuration * sampleRate);

            this.setStatus('Rendering WAV... 0%');

            const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

            // Create a simple master gain
            const masterGain = offlineCtx.createGain();
            masterGain.gain.value = 0.8;
            masterGain.connect(offlineCtx.destination);

            // Schedule all notes
            let currentTime = 0;
            let scheduledBars = 0;
            const totalBars = patternSequence.length;

            for (const seqEntry of patternSequence) {
                const pat = this.state.patterns[seqEntry.patternIdx];
                const steps = seqEntry.stepsCount;

                for (let s = 0; s < steps; s++) {
                    const time = currentTime + s * stepDuration;

                    for (let ch = 0; ch < CHANNELS.length && ch < pat.channels.length; ch++) {
                        const stepData = pat.channels[ch][s];
                        if (!stepData || !stepData.on) continue;
                        const velocity = stepData.velocity || 0.8;
                        const noteLength = (stepData.duration || 1) * stepDuration;

                        // Simplified synth rendering for offline context
                        this.scheduleOfflineNote(offlineCtx, masterGain, ch, time, velocity, stepData.note, stepData.open, noteLength);
                    }
                }

                currentTime += steps * stepDuration;
                scheduledBars++;

                // Update progress
                const pct = Math.round((scheduledBars / totalBars) * 50);
                this.setStatus('Rendering WAV... ' + pct + '%');
            }

            this.setStatus('Rendering WAV... finalizing...');

            try {
                const renderedBuffer = await offlineCtx.startRendering();

                // Encode to WAV
                const wavBlob = this.encodeWAV(renderedBuffer);
                const url = URL.createObjectURL(wavBlob);
                const a = el('a', { href: url, download: 'funkybeats-export.wav' });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.setStatus('WAV exported successfully (' + Math.round(totalDuration) + 's, ' + totalBars + ' bars)');
            } catch (err) {
                this.setStatus('WAV export failed: ' + err.message);
            }
        }

        scheduleOfflineNote(ctx, destination, channelIdx, time, velocity, note, isOpen, noteLength) {
            const ch = CHANNELS[channelIdx];
            if (!ch) return;

            if (ch.type === 'drum') {
                switch (channelIdx) {
                    case 0: this.scheduleOfflineKick(ctx, destination, time, velocity); break;
                    case 1: this.scheduleOfflineSnare(ctx, destination, time, velocity); break;
                    case 2: this.scheduleOfflineHihat(ctx, destination, time, velocity, isOpen); break;
                    case 3: this.scheduleOfflineClap(ctx, destination, time, velocity); break;
                    case 4: this.scheduleOfflinePerc(ctx, destination, time, velocity); break;
                }
            } else {
                this.scheduleOfflineSynth(ctx, destination, channelIdx, time, note || 48, velocity, noteLength);
            }
        }

        scheduleOfflineKick(ctx, dest, time, velocity) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(50, time + 0.04);
            gain.gain.setValueAtTime(velocity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(time);
            osc.stop(time + 0.35);
        }

        scheduleOfflineSnare(ctx, dest, time, velocity) {
            // Tone
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, time);
            osc.frequency.exponentialRampToValueAtTime(120, time + 0.03);
            oscGain.gain.setValueAtTime(velocity * 0.6, time);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            osc.connect(oscGain);
            oscGain.connect(dest);
            osc.start(time);
            osc.stop(time + 0.15);

            // Noise
            const bufferSize = Math.ceil(ctx.sampleRate * 0.15);
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            const noiseGain = ctx.createGain();
            const hpf = ctx.createBiquadFilter();
            hpf.type = 'highpass';
            hpf.frequency.value = 5000;
            noiseGain.gain.setValueAtTime(velocity * 0.4, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            noise.connect(hpf);
            hpf.connect(noiseGain);
            noiseGain.connect(dest);
            noise.start(time);
            noise.stop(time + 0.15);
        }

        scheduleOfflineHihat(ctx, dest, time, velocity, isOpen) {
            const decay = isOpen ? 0.25 : 0.06;
            const bufferSize = Math.ceil(ctx.sampleRate * (decay + 0.05));
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            const gain = ctx.createGain();
            const bpf = ctx.createBiquadFilter();
            bpf.type = 'bandpass';
            bpf.frequency.value = 10000;
            bpf.Q.value = 1;
            gain.gain.setValueAtTime(velocity * 0.35, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
            noise.connect(bpf);
            bpf.connect(gain);
            gain.connect(dest);
            noise.start(time);
            noise.stop(time + decay + 0.05);
        }

        scheduleOfflineClap(ctx, dest, time, velocity) {
            for (let burst = 0; burst < 3; burst++) {
                const t = time + burst * 0.01;
                const bufferSize = Math.ceil(ctx.sampleRate * 0.15);
                const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noise = ctx.createBufferSource();
                noise.buffer = noiseBuffer;
                const gain = ctx.createGain();
                const bpf = ctx.createBiquadFilter();
                bpf.type = 'bandpass';
                bpf.frequency.value = 2500;
                bpf.Q.value = 2;
                gain.gain.setValueAtTime(velocity * 0.4, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                noise.connect(bpf);
                bpf.connect(gain);
                gain.connect(dest);
                noise.start(t);
                noise.stop(t + 0.15);
            }
        }

        scheduleOfflinePerc(ctx, dest, time, velocity) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1500, time);
            osc.frequency.exponentialRampToValueAtTime(200, time + 0.02);
            gain.gain.setValueAtTime(velocity * 0.4, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(time);
            osc.stop(time + 0.1);
        }

        scheduleOfflineSynth(ctx, dest, channelIdx, time, note, velocity, noteLength) {
            const freq = midiToFreq(note);
            const params = this.audio.channelParams[channelIdx];
            const attackTime = (params.attack / 100) * 0.2;
            const decayTime = Math.max(0.1 + (params.decay / 100) * 0.5, noteLength);
            const cutoff = 300 + (params.cutoff / 100) * 5000;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = params.waveform || 'sawtooth';
            osc.frequency.value = freq;

            filter.type = 'lowpass';
            filter.frequency.value = cutoff;
            filter.Q.value = Math.min(params.resonance || 3, 15);

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(velocity * 0.3, time + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(dest);

            osc.start(time);
            osc.stop(time + attackTime + decayTime + 0.01);

            // For chord channel, add chord notes
            if (channelIdx === 8) {
                const chordType = params.chordType || 'minor';
                let intervals;
                switch (chordType) {
                    case 'major': intervals = [4, 7]; break;
                    case 'minor': intervals = [3, 7]; break;
                    case '7th': intervals = [4, 7, 10]; break;
                    case 'min7': intervals = [3, 7, 10]; break;
                    default: intervals = [3, 7]; break;
                }
                for (const interval of intervals) {
                    const cFreq = freq * Math.pow(2, interval / 12);
                    const cOsc = ctx.createOscillator();
                    const cGain = ctx.createGain();
                    cOsc.type = params.waveform || 'sawtooth';
                    cOsc.frequency.value = cFreq;
                    cGain.gain.setValueAtTime(0, time);
                    cGain.gain.linearRampToValueAtTime(velocity * 0.2, time + attackTime);
                    cGain.gain.exponentialRampToValueAtTime(0.001, time + attackTime + decayTime);
                    cOsc.connect(filter);
                    cOsc.start(time);
                    cOsc.stop(time + attackTime + decayTime + 0.01);
                }
            }
        }

        encodeWAV(audioBuffer) {
            const numChannels = audioBuffer.numberOfChannels;
            const sampleRate = audioBuffer.sampleRate;
            const format = 1; // PCM
            const bitsPerSample = 16;
            const blockAlign = numChannels * bitsPerSample / 8;
            const byteRate = sampleRate * blockAlign;
            const dataLength = audioBuffer.length * blockAlign;
            const headerLength = 44;
            const totalLength = headerLength + dataLength;

            const buffer = new ArrayBuffer(totalLength);
            const view = new DataView(buffer);

            // RIFF header
            this.writeString(view, 0, 'RIFF');
            view.setUint32(4, totalLength - 8, true);
            this.writeString(view, 8, 'WAVE');

            // fmt chunk
            this.writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true); // chunk size
            view.setUint16(20, format, true);
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bitsPerSample, true);

            // data chunk
            this.writeString(view, 36, 'data');
            view.setUint32(40, dataLength, true);

            // Interleave channels and write samples
            const channels = [];
            for (let c = 0; c < numChannels; c++) {
                channels.push(audioBuffer.getChannelData(c));
            }

            let offset = 44;
            for (let i = 0; i < audioBuffer.length; i++) {
                for (let c = 0; c < numChannels; c++) {
                    const sample = Math.max(-1, Math.min(1, channels[c][i]));
                    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                    view.setInt16(offset, intSample, true);
                    offset += 2;
                }
            }

            return new Blob([buffer], { type: 'audio/wav' });
        }

        writeString(view, offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        // ---- Phase 6: Mobile Optimization ----
        initMobile() {
            this.buildMobileDrawer();
            this.buildMobilePiano();
            this.bindFabPlay();
            this.bindSwipeNavigation();
            this.bindOrientationChange();
            this.bindPinchZoom();
            this.preventBrowserGestures();
            this.bindLongPressHandlers();
        }

        // Hamburger drawer
        buildMobileDrawer() {
            const drawer = document.getElementById('mobile-drawer');
            const overlay = document.getElementById('mobile-drawer-overlay');
            if (!drawer || !overlay) return;

            // Close button
            const closeBtn = el('button', { className: 'drawer-close', text: '\u00D7' });
            closeBtn.addEventListener('click', () => this.closeMobileDrawer());
            drawer.appendChild(closeBtn);

            // Pattern tools section
            const patSection = el('div', { className: 'drawer-section' });
            patSection.appendChild(el('span', { className: 'drawer-section-label', text: 'PATTERN TOOLS' }));
            const patBtns = [
                { text: 'CPY', handler: () => { this.state.copyPattern(); this.setStatus('Pattern copied'); this.closeMobileDrawer(); } },
                { text: 'PST', handler: () => { if (this.state.pastePattern()) { this.syncStepsDropdown(); this.buildStepIndicators(); this.buildSequencerGrid(); this.drawPianoRoll(); this.drawAutomation(); this.autoSave(); this.setStatus('Pattern pasted'); } this.closeMobileDrawer(); } },
                { text: 'CLR', handler: () => { this.state.clearPattern(); this.buildSequencerGrid(); this.drawPianoRoll(); this.drawAutomation(); this.autoSave(); this.setStatus('Pattern cleared'); this.closeMobileDrawer(); } },
                { text: 'HUM', handler: () => { this.humanizePattern(); this.closeMobileDrawer(); } }
            ];
            for (const pb of patBtns) {
                const btn = el('button', { className: 'tool-btn', text: pb.text });
                btn.style.minHeight = '44px';
                btn.style.minWidth = '60px';
                btn.addEventListener('click', pb.handler);
                patSection.appendChild(btn);
            }
            drawer.appendChild(patSection);

            // Save tools section
            const saveSection = el('div', { className: 'drawer-section' });
            saveSection.appendChild(el('span', { className: 'drawer-section-label', text: 'SAVE / EXPORT' }));
            const saveBtns = [
                { text: 'SAVE', handler: () => { this.saveProject(); this.closeMobileDrawer(); } },
                { text: 'LOAD', handler: () => { this.loadProject(); this.closeMobileDrawer(); } },
                { text: 'JSON', handler: () => { this.exportJSON(); this.closeMobileDrawer(); } },
                { text: 'WAV', handler: () => { this.exportWAV(); this.closeMobileDrawer(); } }
            ];
            for (const sb of saveBtns) {
                const btn = el('button', { className: 'tool-btn', text: sb.text });
                btn.style.minHeight = '44px';
                btn.style.minWidth = '60px';
                btn.addEventListener('click', sb.handler);
                saveSection.appendChild(btn);
            }
            drawer.appendChild(saveSection);

            // Preset section
            const presetSection = el('div', { className: 'drawer-section' });
            presetSection.appendChild(el('span', { className: 'drawer-section-label', text: 'PRESETS' }));
            const browseBtn = el('button', { className: 'tool-btn', text: 'BROWSE PRESETS' });
            browseBtn.style.minHeight = '44px';
            browseBtn.addEventListener('click', () => { this.togglePresetBrowser(); this.closeMobileDrawer(); });
            presetSection.appendChild(browseBtn);
            // Clone preset select for mobile drawer
            const presetSelect = el('select', { className: 'synth-select' });
            const origSelect = document.getElementById('preset-select');
            if (origSelect) {
                for (let i = 0; i < origSelect.options.length; i++) {
                    const opt = el('option', { value: origSelect.options[i].value, text: origSelect.options[i].text });
                    presetSelect.appendChild(opt);
                }
            }
            presetSelect.addEventListener('change', (e) => {
                if (e.target.value) { this.loadPreset(e.target.value); this.closeMobileDrawer(); }
            });
            presetSection.appendChild(presetSelect);
            drawer.appendChild(presetSection);

            // Steps/Swing section
            const ctrlSection = el('div', { className: 'drawer-section' });
            ctrlSection.appendChild(el('span', { className: 'drawer-section-label', text: 'CONTROLS' }));
            const stepsLabel = el('span', { text: 'STEPS:', style: { fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' } });
            ctrlSection.appendChild(stepsLabel);
            const stepsSelect = el('select', { className: 'synth-select' });
            [16, 32, 64].forEach(v => {
                const opt = el('option', { value: String(v), text: String(v) });
                stepsSelect.appendChild(opt);
            });
            stepsSelect.value = String(this.state.getSteps());
            stepsSelect.addEventListener('change', (e) => {
                const newLen = parseInt(e.target.value);
                this.state.pushUndo();
                this.state.setPatternLength(newLen);
                this.buildStepIndicators();
                this.buildSequencerGrid();
                this.drawPianoRoll();
                this.drawAutomation();
                this.autoSave();
                this.setStatus('Pattern length: ' + newLen + ' steps');
                // Sync the main steps dropdown too
                const mainSteps = document.getElementById('steps-select');
                if (mainSteps) mainSteps.value = String(newLen);
            });
            ctrlSection.appendChild(stepsSelect);
            drawer.appendChild(ctrlSection);

            // Hamburger button event
            const hamburgerBtn = document.getElementById('btn-hamburger');
            if (hamburgerBtn) {
                hamburgerBtn.addEventListener('click', () => this.toggleMobileDrawer());
            }

            // Overlay click to close
            overlay.addEventListener('click', () => this.closeMobileDrawer());
        }

        toggleMobileDrawer() {
            const drawer = document.getElementById('mobile-drawer');
            const overlay = document.getElementById('mobile-drawer-overlay');
            if (!drawer) return;
            const isOpen = drawer.classList.contains('open');
            if (isOpen) {
                this.closeMobileDrawer();
            } else {
                drawer.classList.remove('hidden');
                drawer.classList.add('open');
                if (overlay) overlay.classList.remove('hidden');
            }
        }

        closeMobileDrawer() {
            const drawer = document.getElementById('mobile-drawer');
            const overlay = document.getElementById('mobile-drawer-overlay');
            if (drawer) {
                drawer.classList.remove('open');
                setTimeout(() => { if (!drawer.classList.contains('open')) drawer.classList.add('hidden'); }, 300);
            }
            if (overlay) overlay.classList.add('hidden');
        }

        // Mobile piano keyboard
        buildMobilePiano() {
            const container = document.getElementById('mobile-piano');
            if (!container) return;
            this.mobilePianoOctave = this.pianoRollOctave;
            this.renderMobilePianoKeys();
        }

        renderMobilePianoKeys() {
            const container = document.getElementById('mobile-piano');
            if (!container) return;
            while (container.firstChild) container.removeChild(container.firstChild);

            // Octave down button
            const octDownBtn = el('button', { className: 'mobile-piano-octave-btn', text: '\u25C0' });
            octDownBtn.addEventListener('click', () => {
                if (this.mobilePianoOctave > 1) {
                    this.mobilePianoOctave--;
                    this.renderMobilePianoKeys();
                }
            });
            container.appendChild(octDownBtn);

            // White and black key layout for one octave
            const keyLayout = [
                { note: 0, name: 'C', black: false },
                { note: 1, name: 'C#', black: true },
                { note: 2, name: 'D', black: false },
                { note: 3, name: 'D#', black: true },
                { note: 4, name: 'E', black: false },
                { note: 5, name: 'F', black: false },
                { note: 6, name: 'F#', black: true },
                { note: 7, name: 'G', black: false },
                { note: 8, name: 'G#', black: true },
                { note: 9, name: 'A', black: false },
                { note: 10, name: 'A#', black: true },
                { note: 11, name: 'B', black: false }
            ];

            const self = this;
            for (const kd of keyLayout) {
                const midiNote = (self.mobilePianoOctave + 1) * 12 + kd.note;
                const keyEl = el('div', {
                    className: 'mobile-piano-key' + (kd.black ? ' black' : ''),
                    text: kd.name
                });
                keyEl.addEventListener('pointerdown', function(e) {
                    e.preventDefault();
                    self.audio.init().then(function() {
                        self.audio.previewNote(self.pianoRollChannel, midiNote);
                        // If recording, place note
                        if (self.playing && self.recording && self.currentStep >= 0) {
                            const channels = self.state.getCurrentPatternChannels();
                            const ch = self.pianoRollChannel;
                            const stepData = channels[ch][self.currentStep];
                            stepData.on = true;
                            stepData.note = midiNote;
                            self.updateStepDisplay(ch, self.currentStep);
                            self.drawPianoRoll();
                            self.autoSave();
                        }
                    });
                });
                container.appendChild(keyEl);
            }

            // Octave up button
            const octUpBtn = el('button', { className: 'mobile-piano-octave-btn', text: '\u25B6' });
            octUpBtn.addEventListener('click', () => {
                if (this.mobilePianoOctave < 7) {
                    this.mobilePianoOctave++;
                    this.renderMobilePianoKeys();
                }
            });
            container.appendChild(octUpBtn);
        }

        updateMobilePianoVisibility() {
            const piano = document.getElementById('mobile-piano');
            if (!piano) return;
            if (isMobile() && this.activeTab === 'pianoroll') {
                piano.classList.remove('hidden');
            } else {
                piano.classList.add('hidden');
            }
        }

        // FAB play button
        bindFabPlay() {
            const fab = document.getElementById('btn-fab-play');
            if (!fab) return;
            fab.addEventListener('click', () => this.togglePlay());
        }

        updateFabPlayState() {
            const fab = document.getElementById('btn-fab-play');
            if (!fab) return;
            if (this.playing) {
                fab.classList.add('playing');
                fab.textContent = '\u25A0'; // stop icon
            } else {
                fab.classList.remove('playing');
                fab.textContent = '\u25B6'; // play icon
            }
        }

        // Swipe tab navigation
        bindSwipeNavigation() {
            const panels = document.getElementById('panels');
            if (!panels) return;
            let startX = 0;
            let startY = 0;
            let startedOnCanvas = false;

            panels.addEventListener('touchstart', (e) => {
                const t = e.touches[0];
                startX = t.clientX;
                startY = t.clientY;
                startedOnCanvas = !!(e.target.tagName === 'CANVAS');
            }, { passive: true });

            panels.addEventListener('touchend', (e) => {
                if (startedOnCanvas) return;
                const t = e.changedTouches[0];
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;
                if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx)) return;

                const tabs = ['sequencer', 'pianoroll', 'mixer', 'syntheditor', 'automation', 'songmode'];
                const currentIdx = tabs.indexOf(this.activeTab);
                if (currentIdx < 0) return;
                let newIdx;
                if (dx < 0) {
                    newIdx = Math.min(currentIdx + 1, tabs.length - 1);
                } else {
                    newIdx = Math.max(currentIdx - 1, 0);
                }
                if (newIdx !== currentIdx) {
                    this.switchToTab(tabs[newIdx]);
                }
            }, { passive: true });
        }

        switchToTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            const tabBtn = document.querySelector('.tab[data-tab="' + tabName + '"]');
            if (tabBtn) tabBtn.classList.add('active');
            const panel = document.getElementById('panel-' + tabName);
            if (panel) panel.classList.add('active');
            this.activeTab = tabName;
            if (tabName === 'pianoroll') this.drawPianoRoll();
            if (tabName === 'automation') this.drawAutomation();
            this.updateMobilePianoVisibility();
        }

        // Orientation change - resize canvases
        bindOrientationChange() {
            const self = this;
            window.addEventListener('orientationchange', function() {
                setTimeout(function() {
                    if (self.pianoCanvas) {
                        self.drawPianoRoll();
                    }
                    if (self.automationCanvas) {
                        self.drawAutomation();
                    }
                    if (self.arrangementCanvas) {
                        self.drawArrangement();
                    }
                    // Resize visualizer
                    const vis = document.getElementById('visualizer');
                    if (vis) {
                        vis.width = vis.parentElement.offsetWidth;
                    }
                }, 300);
            });
        }

        // Prevent browser gestures (pull-to-refresh, etc)
        preventBrowserGestures() {
            document.body.style.touchAction = 'manipulation';
            // Prevent pull-to-refresh on the main app
            document.addEventListener('touchmove', function(e) {
                if (e.touches.length > 1) return; // allow pinch
                const scrollable = e.target.closest('#panels, .mixer-channels, .seq-steps, .pianoroll-canvas-wrapper, .preset-browser-list');
                if (!scrollable && e.cancelable) {
                    e.preventDefault();
                }
            }, { passive: false });
        }

        // Pinch-zoom on piano roll
        bindPinchZoom() {
            const canvas = this.pianoCanvas;
            if (!canvas) return;
            let initialDist = 0;
            let initialZoom = 1;

            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialDist = Math.sqrt(dx * dx + dy * dy);
                    initialZoom = this.pianoRollZoom;
                }
            }, { passive: true });

            canvas.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (initialDist > 0) {
                        const scale = dist / initialDist;
                        this.pianoRollZoom = Math.max(0.5, Math.min(3.0, initialZoom * scale));
                        this.updatePianoRollZoom();
                    }
                }
            }, { passive: false });
        }

        // Long-press handlers for context menus
        bindLongPressHandlers() {
            // Sequencer grid long-press
            const seqGrid = document.querySelector('.sequencer-grid');
            if (seqGrid) {
                addLongPress(seqGrid, (e) => {
                    const stepEl = e.target.closest('.seq-step');
                    if (!stepEl) return;
                    const ch = parseInt(stepEl.dataset.channel);
                    const s = parseInt(stepEl.dataset.step);
                    const stepData = this.state.getStep(ch, s);
                    const items = [
                        { label: 'Set Velocity 25%', action: () => { stepData.velocity = 0.25; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                        { label: 'Set Velocity 50%', action: () => { stepData.velocity = 0.5; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                        { label: 'Set Velocity 75%', action: () => { stepData.velocity = 0.75; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                        { label: 'Set Velocity 100%', action: () => { stepData.velocity = 1.0; this.updateStepDisplay(ch, s); this.autoSave(); }, disabled: !stepData.on },
                    ];
                    if (ch === 2) {
                        items.push({ label: 'separator' });
                        items.push({ label: 'Toggle Open Hat', action: () => {
                            if (stepData.on) { stepData.open = !stepData.open; this.updateStepDisplay(ch, s); this.autoSave(); }
                        }, disabled: !stepData.on });
                    }
                    items.push({ label: 'separator' });
                    items.push({ label: 'Clear Step', action: () => {
                        this.state.pushUndo();
                        stepData.on = false; stepData.open = false;
                        this.updateStepDisplay(ch, s); this.autoSave(); this.updateUndoRedoButtons();
                    }});
                    this.showContextMenu(e.clientX, e.clientY, items);
                }, 600);
            }

            // Piano roll canvas long-press
            if (this.pianoCanvas) {
                addLongPress(this.pianoCanvas, (e) => {
                    this.handlePianoRollContextMenu(e);
                }, 600);
            }

            // Automation canvas long-press
            if (this.automationCanvas) {
                addLongPress(this.automationCanvas, (e) => {
                    e.preventDefault();
                    this.handleAutomationRightClick(e);
                }, 600);
            }
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
