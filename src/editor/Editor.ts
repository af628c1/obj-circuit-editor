import * as THREE from 'three';
import { Button } from '../parts/Button';
import { Delay } from '../parts/Delay';
import { Led } from '../parts/Led';
import type { Part } from '../parts/Part';
import { partInfo } from '../parts/registry';
import { Switch } from '../parts/Switch';
import { disposeModel } from '../scene/modelLoader';
import type { Viewport } from '../scene/Viewport';
import { diagnose, solve, type Diagnosis, type PartType } from '../sim/circuit';
import { WIRE_COLORS, Wire, type WireEnd } from '../wires/Wire';

/** Parts are modelled at roughly real size; scale them up so they read well on the model. */
export const PART_SCALE = 1.8;
/** Range for the user-facing part size (1 = 100%). */
export const SIZE_RANGE = { min: 0.2, max: 5 };

export type Mode = 'edit' | 'simulate';
export type Selection = { kind: 'part'; part: Part } | { kind: 'wire'; wire: Wire } | null;

/**
 * Owns the document: the loaded model, placed parts and wires, the current
 * selection and mode. Emits `change` whenever any of that changes, and
 * `toast` (detail: string) for user-facing messages.
 */
export class Editor extends EventTarget {
  model: THREE.Object3D | null = null;
  readonly parts = new Map<string, Part>();
  readonly wires: Wire[] = [];
  selection: Selection = null;
  mode: Mode = 'edit';
  /** Size new parts are given: the last size the user picked. */
  defaultSize = 1;

  private readonly partsGroup = new THREE.Group();
  private readonly wiresGroup = new THREE.Group();
  private readonly counters = new Map<PartType, number>();
  private wireCounter = 0;
  private shorted = new Set<string>();

  constructor(readonly viewport: Viewport) {
    super();
    this.partsGroup.name = 'parts';
    this.wiresGroup.name = 'wires';
    viewport.scene.add(this.partsGroup, this.wiresGroup);
    viewport.onBeforeRender(() => {
      for (const w of this.wires) w.update();
    });
  }

  // ---- model -------------------------------------------------------------

  setModel(model: THREE.Object3D) {
    if (this.model) {
      this.viewport.scene.remove(this.model);
      disposeModel(this.model);
    }
    this.model = model;
    this.viewport.scene.add(model);
    this.viewport.frameBox(new THREE.Box3().setFromObject(model));
    this.emit();
  }

  // ---- parts -------------------------------------------------------------

  /**
   * Add a part. If a surface normal is given the part is tilted so it stands
   * out of that surface.
   */
  addPart(type: PartType, position?: THREE.Vector3, normal?: THREE.Vector3): Part {
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const part = partInfo(type).create(`${type}-${n}`);
    part.size = this.defaultSize;
    part.root.scale.setScalar(PART_SCALE * part.size);
    part.root.position.copy(position ?? this.viewport.controls.target);
    if (normal) part.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
    this.partsGroup.add(part.root);
    part.root.updateMatrixWorld(true);
    this.parts.set(part.id, part);
    this.select({ kind: 'part', part });
    this.simulate();
    return part;
  }

  /**
   * Resize a part (and remember the size for new parts). Pass `notify: false`
   * while a slider is being dragged, then notify once at the end.
   */
  setPartSize(part: Part, size: number, notify = true) {
    size = THREE.MathUtils.clamp(size, SIZE_RANGE.min, SIZE_RANGE.max);
    part.size = size;
    part.root.scale.setScalar(PART_SCALE * size);
    part.root.updateMatrixWorld(true);
    this.defaultSize = size;
    if (notify) this.emit();
  }

  /** Give every part the same size. */
  setAllPartSizes(size: number) {
    for (const p of this.parts.values()) this.setPartSize(p, size, false);
    this.emit();
  }

  removePart(part: Part) {
    for (const w of this.wires.filter((w) => w.connects(part))) this.removeWire(w, false);
    if (part instanceof Delay) this.clearTimers(part);
    this.partsGroup.remove(part.root);
    part.dispose();
    this.parts.delete(part.id);
    if (this.selection?.kind === 'part' && this.selection.part === part) this.selection = null;
    this.simulate();
    this.emit();
  }

  /** Every part's root, for raycasting. */
  partRoots(): THREE.Object3D[] {
    return [...this.parts.values()].map((p) => p.root);
  }

  // ---- wires -------------------------------------------------------------

  addWire(from: WireEnd, to: WireEnd, color?: number): Wire | null {
    if (from.part === to.part && from.pin === to.pin) return null;
    const same = (a: WireEnd, b: WireEnd) => a.part === b.part && a.pin === b.pin;
    if (this.wires.some((w) => (same(w.from, from) && same(w.to, to)) || (same(w.from, to) && same(w.to, from)))) {
      this.toast('Those pins are already connected.');
      return null;
    }
    color ??= WIRE_COLORS[this.wireCounter % WIRE_COLORS.length];
    const wire = new Wire(`wire-${++this.wireCounter}`, from, to, color);
    this.wires.push(wire);
    this.wiresGroup.add(wire.mesh);
    this.simulate();
    this.emit();
    return wire;
  }

  removeWire(wire: Wire, notify = true) {
    const i = this.wires.indexOf(wire);
    if (i < 0) return;
    this.wires.splice(i, 1);
    this.wiresGroup.remove(wire.mesh);
    wire.dispose();
    if (this.selection?.kind === 'wire' && this.selection.wire === wire) this.selection = null;
    if (notify) {
      this.simulate();
      this.emit();
    }
  }

  /** Wires attached to a given pin, oldest first. */
  wiresAt(end: WireEnd): Wire[] {
    const at = (e: WireEnd) => e.part === end.part && e.pin === end.pin;
    return this.wires.filter((w) => at(w.from) || at(w.to));
  }

  // ---- selection ---------------------------------------------------------

  select(sel: Selection) {
    if (this.selection?.kind === 'wire') this.selection.wire.setSelected(false);
    this.selection = sel;
    if (sel?.kind === 'wire') sel.wire.setSelected(true);
    this.emit();
  }

  deleteSelection() {
    if (this.mode !== 'edit' || !this.selection) return;
    if (this.selection.kind === 'part') this.removePart(this.selection.part);
    else this.removeWire(this.selection.wire);
  }

  // ---- simulation --------------------------------------------------------

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'simulate') this.select(null);
    for (const p of this.parts.values()) if (p instanceof Button) p.pressed = false;
    this.resetDelays();
    this.shorted.clear();
    this.simulate(mode === 'simulate' ? 'enter' : undefined);
    this.emit();
  }

  setButtonPressed(button: Button, pressed: boolean) {
    if (button.pressed === pressed) return;
    button.pressed = pressed;
    this.simulate(pressed ? 'press' : undefined);
  }

  toggleSwitch(sw: Switch) {
    sw.closed = !sw.closed;
    this.simulate(sw.closed ? 'press' : undefined);
    this.emit();
  }

  /** Pending output changes, per delay. A delay may have several in flight. */
  private readonly timers = new Map<Delay, Set<ReturnType<typeof setTimeout>>>();

  private clearTimers(delay: Delay) {
    for (const t of this.timers.get(delay) ?? []) clearTimeout(t);
    this.timers.delete(delay);
  }

  private resetDelays() {
    for (const p of this.parts.values()) {
      if (!(p instanceof Delay)) continue;
      this.clearTimers(p);
      p.setState(false, false);
    }
  }

  /**
   * Re-solve the circuit and push the result into the parts. `reason` says
   * what the user just did, so we can explain why nothing lit up.
   */
  simulate(reason?: 'enter' | 'press') {
    const leds = [...this.parts.values()].filter((p): p is Led => p instanceof Led);
    if (this.mode !== 'simulate') {
      for (const l of leds) l.lit = false;
      this.resetDelays();
      return;
    }
    const parts = [...this.parts.values()].map((p) => ({
      id: p.id,
      type: p.type,
      pressed: p instanceof Button && p.pressed,
      closed: p instanceof Switch && p.closed,
      conducting: p instanceof Delay && p.conducting,
    }));
    const wires = this.wires.map((w) => ({
      a: { part: w.from.part.id, pin: w.from.pin },
      b: { part: w.to.part.id, pin: w.to.pin },
    }));
    const result = solve(parts, wires);
    for (const l of leds) l.lit = result.lit.has(l.id);
    for (const id of result.shorted) {
      if (!this.shorted.has(id)) this.toast(`Short circuit! ${id}'s + and − are connected directly.`, 'warn');
    }
    this.shorted = result.shorted;

    // A delay replays its input on its output `delayMs` later: every time IN
    // turns on or off, OUT does the same after the delay. So a pulse of any
    // length travels down a chain intact, however short it is. Each change
    // re-solves, which may start the next delay down the chain.
    for (const p of this.parts.values()) {
      if (!(p instanceof Delay)) continue;
      const powered = result.energized.has(p.id);
      if (powered === p.energized) continue;
      p.setState(powered, p.conducting);
      const pending = this.timers.get(p) ?? this.timers.set(p, new Set()).get(p)!;
      const t = setTimeout(() => {
        pending.delete(t);
        p.setState(p.energized, powered);
        this.simulate();
      }, p.delayMs);
      pending.add(t);
    }

    // Stay quiet while a signal is still travelling through delays.
    const inFlight = result.energized.size > 0;
    if (reason && result.lit.size === 0 && result.shorted.size === 0 && !inFlight) {
      const d = diagnose(parts, wires);
      // On entering, an open loop is expected (buttons aren't pressed yet).
      if (reason === 'press' || d.kind === 'no-battery' || d.kind === 'no-led') this.hint(d);
    }
  }

  private lastHint = { text: '', at: 0 };

  private hint(d: Diagnosis) {
    const text = {
      'no-battery':
        'Nothing is powering the circuit. Add a 9V battery: wire + → button → LED long leg (red pin), then LED short leg → battery −.',
      'no-led': 'Add an LED so you can see the circuit work.',
      reversed: `${'led' in d ? d.led : 'The LED'} is backwards: its long leg (red pin) must lead toward the battery's +.`,
      open: "The loop isn't closed. Follow it: battery + → button → LED long leg (red pin) → LED short leg → battery −.",
    }[d.kind];
    // Don't repeat the same hint on every button press.
    const now = performance.now();
    if (text === this.lastHint.text && now - this.lastHint.at < 8000) return;
    this.lastHint = { text, at: now };
    this.toast(text, 'warn');
  }

  // ---- events ------------------------------------------------------------

  toast(message: string, level: 'info' | 'warn' = 'info') {
    this.dispatchEvent(new CustomEvent('toast', { detail: { message, level } }));
  }

  private emit() {
    this.dispatchEvent(new Event('change'));
  }
}
