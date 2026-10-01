import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Button } from '../parts/Button';
import type { Part } from '../parts/Part';
import type { Viewport } from '../scene/Viewport';
import type { Wire, WireEnd } from '../wires/Wire';
import type { Editor } from './Editor';

/** Pick radii in CSS pixels; fingers get more generous targets than a mouse. */
const RADII = {
  mouse: { pin: 14, pinOverBody: 8, wire: 8, slop: 5 },
  touch: { pin: 24, pinOverBody: 14, wire: 18, slop: 10 },
};

type Hit = { kind: 'pin'; end: WireEnd } | { kind: 'part'; part: Part } | { kind: 'wire'; wire: Wire };

/** A press that started on something we handle ourselves (not camera orbit). */
type Gesture =
  /** Pressed, not yet moved far enough to count as a drag. */
  | { kind: 'press'; hit: Hit | null; x: number; y: number; ours: boolean }
  /** Dragging a fresh wire out of a pin. */
  | { kind: 'new-wire'; from: WireEnd }
  /** Dragging one end of an existing wire; `fixed` is the end that stays put. */
  | { kind: 'wire-end'; wire: Wire; fixed: WireEnd }
  /** Sliding a part around. */
  | { kind: 'part'; part: Part }
  /** Holding a push button in simulate mode. */
  | { kind: 'button'; button: Button };

/** Distance from point p to the segment a–b, in the same units. */
function segmentDistance(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Mouse, touch and keyboard handling for the viewport.
 *
 * Edit mode:
 * - tap a part or wire to select it (the inspector then offers Delete)
 * - drag a part to slide it over the model; the gizmo still does precise moves
 * - tap pin, tap pin to wire them, or drag from one pin to another
 * - drag a wire's end off its pin to remove it, or onto another pin to move it
 *
 * Simulate mode: press and hold a push button.
 */
export class Interaction extends EventTarget {
  readonly gizmo: TransformControls;
  /** First pin of a wire started by tapping, waiting for the second tap. */
  pending: WireEnd | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly canvas: HTMLCanvasElement;
  private readonly selectionBox: THREE.BoxHelper;
  private readonly preview: THREE.Line;
  private hovered: WireEnd | null = null;
  private gesture: Gesture | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly viewport: Viewport,
  ) {
    super();
    this.canvas = viewport.renderer.domElement;

    this.gizmo = new TransformControls(viewport.camera, this.canvas);
    this.gizmo.setSize(matchMedia('(pointer: coarse)').matches ? 1.15 : 0.8);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      viewport.controls.enabled = !e.value;
    });
    viewport.scene.add(this.gizmo.getHelper());

    this.selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x3b82f6);
    this.selectionBox.visible = false;
    viewport.scene.add(this.selectionBox);

    this.preview = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0x3b82f6, dashSize: 0.02, gapSize: 0.012, depthTest: false }),
    );
    this.preview.renderOrder = 999;
    this.preview.visible = false;
    viewport.scene.add(this.preview);

    viewport.onBeforeRender(() => {
      if (this.selectionBox.visible) this.selectionBox.update();
    });

    // Capture phase on the container runs before OrbitControls and
    // TransformControls (which listen on the canvas), so a press on a pin
    // or part can claim the gesture instead of orbiting the camera.
    viewport.container.addEventListener('pointerdown', (e) => this.onPointerDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => this.cancelGesture());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    editor.addEventListener('change', () => this.syncSelection());
  }

  setGizmoMode(mode: 'translate' | 'rotate') {
    this.gizmo.setMode(mode);
    this.dispatchEvent(new Event('change'));
  }

  get gizmoMode() {
    return this.gizmo.mode as 'translate' | 'rotate';
  }

  cancelWire() {
    if (!this.pending) return;
    this.pending.part.highlightPin(null);
    this.pending = null;
    this.preview.visible = false;
    this.dispatchEvent(new Event('change'));
  }

  // ---- hit testing -------------------------------------------------------

  /** Screen position (CSS px) of a world point, or null if behind the camera. */
  private toScreen(p: THREE.Vector3): THREE.Vector2 | null {
    const v = p.clone().project(this.viewport.camera);
    if (v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((v.x + 1) / 2) * r.width + r.left, ((1 - v.y) / 2) * r.height + r.top);
  }

  private nearestPin(e: PointerEvent, maxPx: number, except?: WireEnd): { end: WireEnd; dist: number } | null {
    let best: { end: WireEnd; dist: number } | null = null;
    const v = new THREE.Vector3();
    for (const part of this.editor.parts.values()) {
      for (const pin of part.pins) {
        if (except && except.part === part && except.pin === pin.name) continue;
        const s = this.toScreen(pin.mesh.getWorldPosition(v));
        if (!s) continue;
        const dist = Math.hypot(s.x - e.clientX, s.y - e.clientY);
        if (dist < maxPx && (!best || dist < best.dist)) best = { end: { part, pin: pin.name }, dist };
      }
    }
    return best;
  }

  private nearestWire(e: PointerEvent, maxPx: number): Wire | null {
    const p = new THREE.Vector2(e.clientX, e.clientY);
    let best: Wire | null = null;
    let bestDist = maxPx;
    for (const wire of this.editor.wires) {
      if (!wire.mesh.visible || !wire.curve) continue;
      const pts = wire.curve.getPoints(40).map((q) => this.toScreen(q));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!a || !b) continue;
        const d = segmentDistance(p, a, b);
        if (d < bestDist) {
          bestDist = d;
          best = wire;
        }
      }
    }
    return best;
  }

  private raycastParts(e: PointerEvent) {
    this.raycaster.setFromCamera(this.viewport.ndc(e), this.viewport.camera);
    return this.raycaster.intersectObjects(this.editor.partRoots(), true)[0];
  }

  private pickPart(e: PointerEvent): Part | null {
    const hit = this.raycastParts(e);
    return hit ? (this.editor.parts.get(hit.object.userData.partId) ?? null) : null;
  }

  /**
   * What's under the pointer. Pins have a generous radius, but a part body
   * directly under the finger wins unless a pin is very close, otherwise
   * small parts like the LED would be impossible to select.
   */
  private hitTest(e: PointerEvent): Hit | null {
    const r = RADII[isTouch(e) ? 'touch' : 'mouse'];
    const body = this.raycastParts(e);
    const bodyPart = body ? (this.editor.parts.get(body.object.userData.partId) ?? null) : null;
    if (body?.object.userData.pin && bodyPart) {
      return { kind: 'pin', end: { part: bodyPart, pin: body.object.userData.pin } };
    }
    const pin = this.nearestPin(e, r.pin);
    if (pin && (!bodyPart || pin.dist <= r.pinOverBody)) return { kind: 'pin', end: pin.end };
    if (bodyPart) return { kind: 'part', part: bodyPart };
    if (pin) return { kind: 'pin', end: pin.end };
    const wire = this.nearestWire(e, r.wire);
    return wire ? { kind: 'wire', wire } : null;
  }

  // ---- pointer -----------------------------------------------------------

  private onPointerDown(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0 || this.gesture) return;

    if (this.editor.mode === 'simulate') {
      const part = this.pickPart(e);
      if (part instanceof Button) {
        e.stopPropagation();
        this.gesture = { kind: 'button', button: part };
        this.editor.setButtonPressed(part, true);
      }
      return;
    }

    // Presses on the gizmo belong to the gizmo. On touch there's no hover
    // beforehand, so ask it directly whether this press would hit a handle.
    if (this.gizmo.object) {
      this.gizmo.pointerHover(this.viewport.ndc(e) as unknown as PointerEvent);
      if (this.gizmo.axis) return;
    }

    const hit = this.hitTest(e);
    // Pins and parts are ours: keep the camera still. Wires and empty space
    // still orbit on drag, and count as a tap if the pointer barely moves.
    const ours = hit?.kind === 'pin' || hit?.kind === 'part';
    if (ours) {
      e.stopPropagation();
      e.preventDefault();
    }
    this.gesture = { kind: 'press', hit, x: e.clientX, y: e.clientY, ours };
  }

  private onPointerMove(e: PointerEvent) {
    if (!e.isPrimary) return;
    const g = this.gesture;

    if (!g) {
      if (e.pointerType === 'mouse' && e.target === this.canvas && !e.buttons) this.hover(e);
      return;
    }

    if (g.kind === 'press') {
      if (!g.ours) return; // the camera is orbiting
      const slop = RADII[isTouch(e) ? 'touch' : 'mouse'].slop;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < slop) return;
      this.startDrag(g.hit!);
    }

    const d = this.gesture!;
    if (d.kind === 'new-wire' || d.kind === 'wire-end') {
      const from = d.kind === 'new-wire' ? d.from : d.fixed;
      const target = this.nearestPin(e, RADII[isTouch(e) ? 'touch' : 'mouse'].pin, from);
      this.setHovered(target?.end ?? null);
      this.drawPreview(from, e, target?.end ?? null);
    } else if (d.kind === 'part') {
      this.dragPart(d.part, e);
    }
  }

  private startDrag(hit: Hit) {
    this.cancelWire();
    if (hit.kind === 'part') {
      this.editor.select({ kind: 'part', part: hit.part });
      this.gesture = { kind: 'part', part: hit.part };
    } else if (hit.kind === 'pin') {
      // Grab the newest wire on this pin if there is one; otherwise pull out a new wire.
      const wire = this.editor.wiresAt(hit.end).at(-1);
      if (wire) {
        wire.mesh.visible = false;
        this.gesture = { kind: 'wire-end', wire, fixed: wire.otherEnd(hit.end) };
      } else {
        this.gesture = { kind: 'new-wire', from: hit.end };
      }
      hit.end.part.highlightPin(hit.end.pin);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!e.isPrimary) return;
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;

    switch (g.kind) {
      case 'button':
        this.editor.setButtonPressed(g.button, false);
        break;

      case 'press': {
        // Only a short, still press is a tap; anything else was an orbit.
        const slop = RADII[isTouch(e) ? 'touch' : 'mouse'].slop;
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) <= slop) this.onTap(g.hit);
        break;
      }

      case 'new-wire': {
        const target = this.nearestPin(e, RADII[isTouch(e) ? 'touch' : 'mouse'].pin, g.from);
        this.endWireDrag();
        if (target) this.connect(g.from, target.end);
        break;
      }

      case 'wire-end': {
        const target = this.nearestPin(e, RADII[isTouch(e) ? 'touch' : 'mouse'].pin, g.fixed);
        this.endWireDrag();
        g.wire.mesh.visible = true;
        this.editor.removeWire(g.wire);
        if (target) this.connect(g.fixed, target.end, g.wire.color);
        else this.editor.toast('Wire removed');
        break;
      }

      case 'part':
        this.editor.select({ kind: 'part', part: g.part });
        break;
    }
  }

  private cancelGesture() {
    const g = this.gesture;
    this.gesture = null;
    if (g?.kind === 'button') this.editor.setButtonPressed(g.button, false);
    if (g?.kind === 'wire-end') g.wire.mesh.visible = true;
    if (g?.kind === 'new-wire' || g?.kind === 'wire-end') this.endWireDrag();
  }

  private onTap(hit: Hit | null) {
    if (hit?.kind === 'pin') {
      if (!this.pending) {
        this.pending = hit.end;
        hit.end.part.highlightPin(hit.end.pin);
        this.preview.visible = false;
        this.dispatchEvent(new Event('change'));
      } else {
        const from = this.pending;
        this.cancelWire();
        this.connect(from, hit.end);
      }
      return;
    }

    if (this.pending) {
      this.cancelWire();
      return;
    }

    if (hit?.kind === 'part') this.editor.select({ kind: 'part', part: hit.part });
    else if (hit?.kind === 'wire') this.editor.select({ kind: 'wire', wire: hit.wire });
    else this.editor.select(null);
  }

  private connect(a: WireEnd, b: WireEnd, color?: number) {
    a.part.highlightPin(null);
    b.part.highlightPin(null);
    const wire = this.editor.addWire(a, b, color);
    if (wire) this.editor.select({ kind: 'wire', wire });
  }

  // ---- wire previews & hover ---------------------------------------------

  private hover(e: PointerEvent) {
    const hit = this.hitTest(e);
    const pin = hit?.kind === 'pin' ? hit.end : null;
    this.setHovered(pin);
    this.canvas.style.cursor = pin ? 'crosshair' : hit ? 'pointer' : '';
    if (this.pending) this.drawPreview(this.pending, e, pin);
  }

  private setHovered(end: WireEnd | null) {
    const prev = this.hovered;
    this.hovered = end;
    if (prev) prev.part.highlightPin(this.pending?.part === prev.part ? this.pending.pin : null);
    if (end) end.part.highlightPin(end.pin);
  }

  private drawPreview(from: WireEnd, e: PointerEvent, target: WireEnd | null) {
    const start = from.part.pinWorldPosition(from.pin);
    let end: THREE.Vector3;
    if (target) {
      end = target.part.pinWorldPosition(target.pin);
    } else {
      // Follow the pointer on a camera-facing plane through the start pin.
      const normal = this.viewport.camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start);
      this.raycaster.setFromCamera(this.viewport.ndc(e), this.viewport.camera);
      end = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? start.clone();
    }
    this.preview.geometry.setFromPoints([start, end]);
    this.preview.computeLineDistances();
    this.preview.visible = true;
  }

  private endWireDrag() {
    this.preview.visible = false;
    this.setHovered(null);
    for (const p of this.editor.parts.values()) p.highlightPin(null);
  }

  // ---- part dragging -----------------------------------------------------

  /** Slide a part over the model's surface, or along a camera-facing plane off it. */
  private dragPart(part: Part, e: PointerEvent) {
    this.raycaster.setFromCamera(this.viewport.ndc(e), this.viewport.camera);
    const hit = this.editor.model ? this.raycaster.intersectObject(this.editor.model, true)[0] : undefined;
    if (hit?.face) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate();
      part.root.position.copy(hit.point);
      // Stand the part up on the new surface, keeping its twist.
      const up = UP.clone().applyQuaternion(part.root.quaternion);
      part.root.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(up, normal));
    } else {
      const normal = this.viewport.camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, part.root.position);
      const p = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (p) part.root.position.copy(p);
    }
    part.root.updateMatrixWorld(true);
  }

  // ---- keyboard ----------------------------------------------------------

  private onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;

    switch (e.key) {
      case 'Escape':
        if (this.pending) this.cancelWire();
        else this.editor.select(null);
        break;
      case 'Delete':
      case 'Backspace':
        this.editor.deleteSelection();
        e.preventDefault();
        break;
      case 'w':
      case 'W':
        this.setGizmoMode('translate');
        break;
      case 'e':
      case 'E':
        this.setGizmoMode('rotate');
        break;
    }
  }

  // ---- selection visuals -------------------------------------------------

  private syncSelection() {
    const sel = this.editor.selection;
    const part = this.editor.mode === 'edit' && sel?.kind === 'part' ? sel.part : null;
    if (part) {
      if (this.gizmo.object !== part.root) this.gizmo.attach(part.root);
      this.selectionBox.setFromObject(part.root);
      this.selectionBox.visible = true;
    } else {
      this.gizmo.detach();
      this.selectionBox.visible = false;
    }
    if (this.editor.mode === 'simulate') this.cancelWire();
    // A part may have been deleted out from under a pending wire.
    if (this.pending && !this.editor.parts.has(this.pending.part.id)) this.cancelWire();
  }
}
