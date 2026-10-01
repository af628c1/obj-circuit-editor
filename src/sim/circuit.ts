// Tiny netlist solver. No currents or voltages: it only answers
// "does this LED sit on a forward path from a battery's + to its −?"
//
// Time-dependent parts (delays) are solved one instant at a time: the caller
// says which delays are currently firing, and gets back which ones are
// receiving power, then flips them after their delay and solves again.
// A firing delay drives its OUT pin itself, like a relay or a node of
// Ranvier regenerating the signal, so the end of a pulse travels too.

export type PartType = 'led' | 'button' | 'switch' | 'delay' | 'battery';

export interface SimPart {
  id: string;
  type: PartType;
  /** Buttons only: whether the button is currently held down. */
  pressed?: boolean;
  /** Switches only: whether the switch is on. */
  closed?: boolean;
  /** Delays only: whether the delay is currently firing (driving OUT). */
  conducting?: boolean;
}

/** A pin reference, e.g. `{ part: 'led-1', pin: 'anode' }`. */
export interface PinRef {
  part: string;
  pin: string;
}

export interface SimWire {
  a: PinRef;
  b: PinRef;
}

export interface SimResult {
  /** IDs of LEDs that are lit. */
  lit: Set<string>;
  /** IDs of batteries whose terminals are shorted together. */
  shorted: Set<string>;
  /** IDs of delays whose IN pin is receiving power from a battery's +. */
  energized: Set<string>;
}

/** Pin names for each part type. Order matters for the two-terminal semantics. */
export const PINS: Record<PartType, readonly [string, string]> = {
  led: ['anode', 'cathode'],
  button: ['a', 'b'],
  switch: ['a', 'b'],
  delay: ['in', 'out'],
  battery: ['pos', 'neg'],
};

const key = (r: PinRef) => `${r.part}:${r.pin}`;

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function solve(parts: SimPart[], wires: SimWire[]): SimResult {
  const uf = new UnionFind();
  for (const w of wires) uf.union(key(w.a), key(w.b));
  for (const p of parts) {
    if ((p.type === 'button' && p.pressed) || (p.type === 'switch' && p.closed)) {
      uf.union(key({ part: p.id, pin: 'a' }), key({ part: p.id, pin: 'b' }));
    }
  }

  const net = (part: string, pin: string) => uf.find(key({ part, pin }));

  // LEDs are directed edges anode-net → cathode-net. An LED whose two
  // legs are on the same net is bypassed and can never light.
  const leds = parts
    .filter((p) => p.type === 'led')
    .map((p) => ({ id: p.id, from: net(p.id, 'anode'), to: net(p.id, 'cathode') }))
    .filter((e) => e.from !== e.to);
  const delays = parts.filter((p) => p.type === 'delay');

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const e of leds) {
    (forward.get(e.from) ?? forward.set(e.from, []).get(e.from)!).push(e.to);
    (backward.get(e.to) ?? backward.set(e.to, []).get(e.to)!).push(e.from);
  }

  const reach = (starts: string[], adj: Map<string, string[]>) => {
    const seen = new Set(starts);
    const stack = [...starts];
    while (stack.length) {
      for (const n of adj.get(stack.pop()!) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return seen;
  };

  const lit = new Set<string>();
  const shorted = new Set<string>();
  const energized = new Set<string>();

  // Sources: every working battery's +, plus the OUT of every firing delay.
  // Sinks: every working battery's −.
  const sources: string[] = [];
  const sinks: string[] = [];
  for (const b of parts) {
    if (b.type !== 'battery') continue;
    const pos = net(b.id, 'pos');
    const neg = net(b.id, 'neg');
    if (pos === neg) {
      shorted.add(b.id);
      continue;
    }
    sources.push(pos);
    sinks.push(neg);
  }
  for (const d of delays) if (d.conducting) sources.push(net(d.id, 'out'));

  // An LED is lit if a source reaches its anode and its cathode reaches a sink.
  const fromSource = reach(sources, forward);
  const toSink = reach(sinks, backward);
  if (sinks.length) {
    for (const e of leds) if (fromSource.has(e.from) && toSink.has(e.to)) lit.add(e.id);
  }
  for (const d of delays) if (fromSource.has(net(d.id, 'in'))) energized.add(d.id);

  return { lit, shorted, energized };
}

export type Diagnosis =
  | { kind: 'no-battery' }
  | { kind: 'no-led' }
  | { kind: 'reversed'; led: string }
  | { kind: 'open' };

/**
 * Explain why no LED is lit, so the user isn't left guessing. Only meaningful
 * when `solve` lit nothing and nothing is shorted.
 */
export function diagnose(parts: SimPart[], wires: SimWire[]): Diagnosis {
  if (!parts.some((p) => p.type === 'battery')) return { kind: 'no-battery' };
  const leds = parts.filter((p) => p.type === 'led');
  if (leds.length === 0) return { kind: 'no-led' };

  // Would an LED light if it were turned around?
  const flip: Record<string, string> = { anode: 'cathode', cathode: 'anode' };
  for (const led of leds) {
    const swap = (r: PinRef): PinRef => (r.part === led.id ? { part: r.part, pin: flip[r.pin] } : r);
    if (solve(parts, wires.map((w) => ({ a: swap(w.a), b: swap(w.b) }))).lit.has(led.id)) {
      return { kind: 'reversed', led: led.id };
    }
  }
  return { kind: 'open' };
}
