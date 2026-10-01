import { describe, expect, it } from 'vitest';
import { diagnose, solve, type SimPart, type SimWire } from './circuit';

const w = (a: string, b: string): SimWire => {
  const [ap, an] = a.split(':');
  const [bp, bn] = b.split(':');
  return { a: { part: ap, pin: an }, b: { part: bp, pin: bn } };
};

describe('solve', () => {
  const loop = [w('bat:pos', 'btn:a'), w('btn:b', 'led:anode'), w('led:cathode', 'bat:neg')];
  const parts = (pressed: boolean): SimPart[] => [
    { id: 'bat', type: 'battery' },
    { id: 'btn', type: 'button', pressed },
    { id: 'led', type: 'led' },
  ];

  it('lights an LED in a direct loop', () => {
    const r = solve(
      [{ id: 'bat', type: 'battery' }, { id: 'led', type: 'led' }],
      [w('bat:pos', 'led:anode'), w('led:cathode', 'bat:neg')],
    );
    expect([...r.lit]).toEqual(['led']);
  });

  it('does not light a reversed LED', () => {
    const r = solve(
      [{ id: 'bat', type: 'battery' }, { id: 'led', type: 'led' }],
      [w('bat:pos', 'led:cathode'), w('led:anode', 'bat:neg')],
    );
    expect(r.lit.size).toBe(0);
  });

  it('respects the button state', () => {
    expect(solve(parts(false), loop).lit.size).toBe(0);
    expect([...solve(parts(true), loop).lit]).toEqual(['led']);
  });

  it('lights LEDs in series', () => {
    const r = solve(
      [{ id: 'bat', type: 'battery' }, { id: 'l1', type: 'led' }, { id: 'l2', type: 'led' }],
      [w('bat:pos', 'l1:anode'), w('l1:cathode', 'l2:anode'), w('l2:cathode', 'bat:neg')],
    );
    expect(r.lit).toEqual(new Set(['l1', 'l2']));
  });

  it('does not light a dangling LED', () => {
    const r = solve(
      [{ id: 'bat', type: 'battery' }, { id: 'led', type: 'led' }],
      [w('bat:pos', 'led:anode')],
    );
    expect(r.lit.size).toBe(0);
  });

  it('detects a short through a pressed button', () => {
    const r = solve(
      [{ id: 'bat', type: 'battery' }, { id: 'btn', type: 'button', pressed: true }],
      [w('bat:pos', 'btn:a'), w('btn:b', 'bat:neg')],
    );
    expect([...r.shorted]).toEqual(['bat']);
    expect(r.lit.size).toBe(0);
  });

  it('does not light an LED bypassed by a wire', () => {
    const r = solve(
      [{ id: 'bat', type: 'battery' }, { id: 'led', type: 'led' }],
      [w('bat:pos', 'led:anode'), w('led:anode', 'led:cathode')],
    );
    expect(r.lit.size).toBe(0);
  });
});

describe('diagnose', () => {
  it('spots a missing battery', () => {
    expect(
      diagnose(
        [{ id: 'led', type: 'led' }, { id: 'btn', type: 'button', pressed: true }],
        [w('btn:a', 'led:anode'), w('led:cathode', 'btn:b')],
      ),
    ).toEqual({ kind: 'no-battery' });
  });

  it('spots a backwards LED', () => {
    expect(
      diagnose(
        [{ id: 'bat', type: 'battery' }, { id: 'led', type: 'led' }],
        [w('bat:pos', 'led:cathode'), w('led:anode', 'bat:neg')],
      ),
    ).toEqual({ kind: 'reversed', led: 'led' });
  });

  it('falls back to an open circuit', () => {
    expect(
      diagnose([{ id: 'bat', type: 'battery' }, { id: 'led', type: 'led' }], [w('bat:pos', 'led:anode')]),
    ).toEqual({ kind: 'open' });
  });
});

describe('switch and delay', () => {
  it('a closed switch completes the loop, an open one does not', () => {
    const wires = [w('bat:pos', 'sw:a'), w('sw:b', 'led:anode'), w('led:cathode', 'bat:neg')];
    const parts = (closed: boolean): SimPart[] => [
      { id: 'bat', type: 'battery' },
      { id: 'sw', type: 'switch', closed },
      { id: 'led', type: 'led' },
    ];
    expect(solve(parts(false), wires).lit.size).toBe(0);
    expect([...solve(parts(true), wires).lit]).toEqual(['led']);
  });

  // Axon-style chain: + feeds LED 1 directly, and LED 2 through a delay.
  const wires = [
    w('bat:pos', 'l1:anode'),
    w('l1:anode', 'd:in'),
    w('d:out', 'l2:anode'),
    w('l1:cathode', 'bat:neg'),
    w('l2:cathode', 'bat:neg'),
  ];
  const parts = (conducting: boolean): SimPart[] => [
    { id: 'bat', type: 'battery' },
    { id: 'd', type: 'delay', conducting },
    { id: 'l1', type: 'led' },
    { id: 'l2', type: 'led' },
  ];

  it('a delay that has not fired yet is energized but blocks its output', () => {
    const r = solve(parts(false), wires);
    expect(r.lit).toEqual(new Set(['l1']));
    expect([...r.energized]).toEqual(['d']);
  });

  it('a conducting delay powers the next stage', () => {
    expect(solve(parts(true), wires).lit).toEqual(new Set(['l1', 'l2']));
  });

  it('a delay only passes power forwards', () => {
    const backwards = [w('bat:pos', 'd:out'), w('d:in', 'l2:anode'), w('l2:cathode', 'bat:neg')];
    const r = solve(parts(true), backwards);
    expect(r.lit.size).toBe(0);
    expect(r.energized.size).toBe(0);
  });
});

describe('delay as a relay', () => {
  it('keeps the next stage lit after the input goes quiet, until it stops firing', () => {
    // The switch is off, but the delay is still firing from earlier.
    const parts: SimPart[] = [
      { id: 'bat', type: 'battery' },
      { id: 'sw', type: 'switch', closed: false },
      { id: 'd', type: 'delay', conducting: true },
      { id: 'l2', type: 'led' },
    ];
    const wires = [w('bat:pos', 'sw:a'), w('sw:b', 'd:in'), w('d:out', 'l2:anode'), w('l2:cathode', 'bat:neg')];
    const r = solve(parts, wires);
    expect([...r.lit]).toEqual(['l2']);
    expect(r.energized.size).toBe(0);
  });
});
