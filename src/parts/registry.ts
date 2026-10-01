import type { PartType } from '../sim/circuit';
import { Battery } from './Battery';
import { Button } from './Button';
import { Led } from './Led';
import type { Part } from './Part';

export interface PartInfo {
  type: PartType;
  name: string;
  description: string;
  /** Inline SVG markup for the sidebar card. */
  icon: string;
  create: (id: string) => Part;
}

export const PARTS: PartInfo[] = [
  {
    type: 'led',
    name: 'LED',
    description: 'Lights up when current flows from anode (long leg) to cathode.',
    icon: `<svg viewBox="0 0 40 40" fill="none" stroke-width="2" stroke-linecap="round">
      <path d="M12 22v-8a8 8 0 0 1 16 0v8z" fill="#ff3b30" fill-opacity=".85" stroke="#c62a21"/>
      <path d="M10 22h20" stroke="#c62a21"/>
      <path d="M16 23v12M24 23v9" stroke="currentColor"/></svg>`,
    create: (id) => new Led(id),
  },
  {
    type: 'button',
    name: 'Push button',
    description: 'Momentary switch. Closes the circuit while held.',
    icon: `<svg viewBox="0 0 40 40" fill="none" stroke-width="2" stroke-linecap="round">
      <rect x="7" y="17" width="26" height="12" rx="2" fill="#2b2f36" stroke="#2b2f36"/>
      <rect x="13" y="10" width="14" height="8" rx="3" fill="#4c8dff" stroke="#3a74d8"/>
      <path d="M10 29v6M30 29v6" stroke="currentColor"/></svg>`,
    create: (id) => new Button(id),
  },
  {
    type: 'battery',
    name: '9V battery',
    description: 'Power source with + and − terminals.',
    icon: `<svg viewBox="0 0 40 40" fill="none" stroke-width="2" stroke-linecap="round">
      <rect x="10" y="9" width="20" height="27" rx="2" fill="#1f2329" stroke="#1f2329"/>
      <rect x="10" y="26" width="20" height="10" rx="1" fill="#f2b705"/>
      <path d="M15 5v4M25 5v4" stroke="currentColor"/>
      <path d="M14 17h4M16 15v4M22 17h4" stroke="#fff" stroke-width="1.6"/></svg>`,
    create: (id) => new Battery(id),
  },
];

export const partInfo = (type: PartType) => PARTS.find((p) => p.type === type)!;
