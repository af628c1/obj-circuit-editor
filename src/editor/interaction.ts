import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Button } from '../parts/Button';
import type { Part } from '../parts/Part';
import type { Viewport } from '../scene/Viewport';
import type { WireEnd } from '../wires/Wire';
import type { Editor } from './Editor';

/** How close (in CSS pixels) the pointer must be to a pin to grab it. */
const PIN_PICK_PX = 14;
/** Pointer travel (px) under which a press-release counts as a click. */
const CLICK_SLOP_PX = 5;

/**
 * Mouse and keyboard handling for the viewport: selecting, moving and
 * rotating parts, drawing wires between pins and pressing buttons.
 */
export class Interaction extends EventTarget {
  readonly gizmo: TransformControls;
  /** The first pin of a wire being drawn, if any. */
  pending: WireEnd | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly canvas: HTMLCanvasElement;
  private readonly selectionBox: THREE.BoxHelper;
  private readonly preview: THREE.Line;
  private hovered: WireEnd | null = null;
  private down: { x: number; y: number; onGizmo: boolean } | null = null;
  private heldButton: Button | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly viewport: Viewport,
  ) {
    super();
    this.canvas = viewport.renderer.domElement;

    this.gizmo = new TransformControls(viewport.camera, this.canvas);
    this.gizmo.setSize(0.8);
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

    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
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

  // ---- picking -----------------------------------------------------------

  private pickPin(e: PointerEvent): WireEnd | null {
    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best: WireEnd | null = null;
    let bestDist = PIN_PICK_PX;
    for (const part of this.editor.parts.values()) {
      for (const pin of part.pins) {
        pin.mesh.getWorldPosition(v).project(this.viewport.camera);
        if (v.z > 1) continue;
        const x = ((v.x + 1) / 2) * rect.width + rect.left;
        const y = ((1 - v.y) / 2) * rect.height + rect.top;
        const d = Math.hypot(x - e.clientX, y - e.clientY);
        if (d < bestDist) {
          bestDist = d;
          best = { part, pin: pin.name };
        }
      }
    }
    return best;
  }

  private raycast(e: PointerEvent, objects: THREE.Object3D[]) {
    this.raycaster.setFromCamera(this.viewport.ndc(e), this.viewport.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  private pickPart(e: PointerEvent): Part | null {
    const hit = this.raycast(e, this.editor.partRoots())[0];
    return hit ? (this.editor.parts.get(hit.object.userData.partId) ?? null) : null;
  }

  // ---- pointer -----------------------------------------------------------

  private onPointerMove(e: PointerEvent) {
    if (this.gizmo.dragging || e.buttons) return;

    if (this.editor.mode === 'simulate') {
      const part = this.pickPart(e);
      this.canvas.style.cursor = part instanceof Button ? 'pointer' : '';
      return;
    }

    const pin = this.pickPin(e);
    if (this.hovered && this.hovered.part !== this.pending?.part) this.hovered.part.highlightPin(null);
    if (this.hovered && this.hovered.part === this.pending?.part) this.pending.part.highlightPin(this.pending.pin);
    this.hovered = pin;
    if (pin) pin.part.highlightPin(pin.pin);
    this.canvas.style.cursor = pin ? 'crosshair' : '';
    this.dispatchEvent(new CustomEvent('hover', { detail: pin }));

    if (this.pending) this.updatePreview(e, pin);
  }

  private updatePreview(e: PointerEvent, target: WireEnd | null) {
    const start = this.pending!.part.pinWorldPosition(this.pending!.pin);
    let end: THREE.Vector3;
    if (target) {
      end = target.part.pinWorldPosition(target.pin);
    } else {
      // Follow the cursor on a camera-facing plane through the start pin.
      const normal = this.viewport.camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start);
      this.raycaster.setFromCamera(this.viewport.ndc(e), this.viewport.camera);
      end = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? start.clone();
    }
    this.preview.geometry.setFromPoints([start, end]);
    this.preview.computeLineDistances();
    this.preview.visible = true;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;

    if (this.editor.mode === 'simulate') {
      const part = this.pickPart(e);
      if (part instanceof Button) {
        this.heldButton = part;
        this.editor.setButtonPressed(part, true);
        this.viewport.controls.enabled = false;
      }
      return;
    }

    // The gizmo sets `axis` while hovered; a press on it is a drag, not a click.
    this.down = { x: e.clientX, y: e.clientY, onGizmo: this.gizmo.axis !== null };
  }

  private onPointerUp(e: PointerEvent) {
    if (this.heldButton) {
      this.editor.setButtonPressed(this.heldButton, false);
      this.heldButton = null;
      this.viewport.controls.enabled = true;
      return;
    }

    const down = this.down;
    this.down = null;
    if (!down || down.onGizmo || e.target !== this.canvas) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    this.onClick(e);
  }

  private onClick(e: PointerEvent) {
    const pin = this.pickPin(e);
    if (pin) {
      if (!this.pending) {
        this.pending = pin;
        pin.part.highlightPin(pin.pin);
        this.updatePreview(e, null);
        this.dispatchEvent(new Event('change'));
      } else {
        const from = this.pending;
        this.cancelWire();
        const wire = this.editor.addWire(from, pin);
        if (wire) this.editor.select({ kind: 'wire', wire });
        pin.part.highlightPin(null);
      }
      return;
    }

    if (this.pending) {
      this.cancelWire();
      return;
    }

    const part = this.pickPart(e);
    if (part) {
      this.editor.select({ kind: 'part', part });
      return;
    }
    const wireHit = this.raycast(e, this.editor.wireMeshes())[0];
    const wire = wireHit && this.editor.wires.find((w) => w.mesh === wireHit.object);
    this.editor.select(wire ? { kind: 'wire', wire } : null);
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
