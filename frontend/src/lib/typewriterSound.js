// Optional, synthesized typewriter sounds (Web Audio, no audio files).
// Every sound is a few audio nodes that live ~100 ms: cheap enough to never
// slow down typing. Off by default; the writer turns it on in the editor.

let ctx = null
let noise = null

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function burst({ freq, q = 1.4, gain = 0.16, decay = 0.045, delay = 0, type = 'bandpass' }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const src = c.createBufferSource()
  src.buffer = noise
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(t, Math.random() * 0.15)
  src.stop(t + decay + 0.02)
}

function thunk(freq = 140, gain = 0.12, decay = 0.05, delay = 0) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, t)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + decay)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + decay + 0.02)
}

export const typewriter = {
  key() {
    burst({ freq: 2100 + Math.random() * 900, gain: 0.14 + Math.random() * 0.05 })
    thunk(150 + Math.random() * 40, 0.07, 0.04)
  },
  space() {
    burst({ freq: 900, q: 0.9, gain: 0.12, decay: 0.07 })
    thunk(95, 0.09, 0.07)
  },
  backspace() {
    burst({ freq: 1500, q: 2, gain: 0.08, decay: 0.035 })
  },
  // Carriage return: a ratchet of small clicks sliding back.
  carriageReturn() {
    for (let i = 0; i < 6; i++) burst({ freq: 3200 - i * 220, q: 3, gain: 0.05, decay: 0.02, delay: i * 0.028 })
    thunk(110, 0.1, 0.09, 0.2)
  },
  // The margin bell, a few characters before the end of the line.
  bell() {
    const c = ensure()
    if (!c) return
    const t = c.currentTime
    ;[2093, 3140, 4186].forEach((f, i) => {
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      const g = c.createGain()
      g.gain.setValueAtTime([0.06, 0.025, 0.012][i], t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
      osc.connect(g).connect(c.destination)
      osc.start(t)
      osc.stop(t + 0.95)
    })
  },
}
