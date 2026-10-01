import { describe, expect, it } from 'vitest';
import { solve, type SimPart, type SimWire } from './circuit';

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
