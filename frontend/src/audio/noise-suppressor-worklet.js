/**
 * Audio Worklet: RNNoise noise suppression.
 * Load with audioContext.audioWorklet.addModule(workletUrl).
 * Uses @jitsi/rnnoise-wasm sync module (480 samples per frame); process() receives 128.
 */

import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';

const RNNOISE_SAMPLE_LENGTH = 480;
const PROC_NODE_SAMPLE_RATE = 128;
const SHIFT_16_BIT = 32768;

function gcd(a, b) {
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}
function lcm(a, b) {
  return (a * b) / gcd(a, b);
}

class RnnoiseProcessor {
  constructor(wasmModule) {
    this._ctx = wasmModule._rnnoise_create();
    this._bufPtr = wasmModule._malloc(RNNOISE_SAMPLE_LENGTH * 4);
    this._f32Index = this._bufPtr >> 2;
    this._mod = wasmModule;
  }

  getSampleLength() {
    return RNNOISE_SAMPLE_LENGTH;
  }

  processAudioFrame(pcmFrame, shouldDenoise) {
    const mod = this._mod;
    const idx = this._f32Index;
    for (let i = 0; i < RNNOISE_SAMPLE_LENGTH; i++) {
      mod.HEAPF32[idx + i] = pcmFrame[i] * SHIFT_16_BIT;
    }
    const vad = mod._rnnoise_process_frame(this._ctx, this._bufPtr, this._bufPtr);
    if (shouldDenoise) {
      for (let i = 0; i < RNNOISE_SAMPLE_LENGTH; i++) {
        pcmFrame[i] = mod.HEAPF32[idx + i] / SHIFT_16_BIT;
      }
    }
    return vad;
  }
}

class NoiseSuppressorWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    const mod = createRNNWasmModuleSync();
    this._denoise = new RnnoiseProcessor(mod);
    this._denoiseSampleSize = this._denoise.getSampleLength();
    this._circularBufferLength = lcm(PROC_NODE_SAMPLE_RATE, this._denoiseSampleSize);
    this._circularBuffer = new Float32Array(this._circularBufferLength);
    this._inputBufferLength = 0;
    this._denoisedBufferLength = 0;
    this._denoisedBufferIndx = 0;
  }

  process(inputs, outputs) {
    const inData = inputs[0]?.[0];
    const outData = outputs[0]?.[0];
    if (!inData || !outData) return true;

    this._circularBuffer.set(inData, this._inputBufferLength);
    this._inputBufferLength += inData.length;

    for (; this._denoisedBufferLength + this._denoiseSampleSize <= this._inputBufferLength; this._denoisedBufferLength += this._denoiseSampleSize) {
      const frame = this._circularBuffer.subarray(
        this._denoisedBufferLength,
        this._denoisedBufferLength + this._denoiseSampleSize
      );
      this._denoise.processAudioFrame(frame, true);
    }

    let unsentLength;
    if (this._denoisedBufferIndx > this._denoisedBufferLength) {
      unsentLength = this._circularBufferLength - this._denoisedBufferIndx;
    } else {
      unsentLength = this._denoisedBufferLength - this._denoisedBufferIndx;
    }

    if (unsentLength >= outData.length) {
      outData.set(this._circularBuffer.subarray(this._denoisedBufferIndx, this._denoisedBufferIndx + outData.length), 0);
      this._denoisedBufferIndx += outData.length;
    }

    if (this._denoisedBufferIndx === this._circularBufferLength) this._denoisedBufferIndx = 0;
    if (this._inputBufferLength === this._circularBufferLength) {
      this._inputBufferLength = 0;
      this._denoisedBufferLength = 0;
    }
    return true;
  }
}

registerProcessor('NoiseSuppressorWorklet', NoiseSuppressorWorklet);
