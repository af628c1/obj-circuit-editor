import type { PartType } from '../sim/circuit';
import { Battery } from './Battery';
import { Button } from './Button';
import { Delay } from './Delay';
import { Led } from './Led';
import type { Part } from './Part';
import { Switch } from './Switch';

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
    type: 'switch',
    name: 'Toggle switch',
    description: 'Flip it on or off. Stays where you leave it.',
    icon: `<svg viewBox="0 0 40 40" fill="none" stroke-width="2" stroke-linecap="round">
      <rect x="7" y="19" width="26" height="10" rx="2" fill="#2b2f36" stroke="#2b2f36"/>
      <path d="M20 19l6-11" stroke="#9aa1ad" stroke-width="3"/>
      <circle cx="26.5" cy="7.5" r="3" fill="#34c759"/>
      <path d="M11 29v6M29 29v6" stroke="currentColor"/></svg>`,
    create: (id) => new Switch(id),
  },
  {
    type: 'delay',
    name: 'Delay',
    description: 'Whatever reaches IN comes out of OUT a set time later, even a quick tap. Chain them to send a pulse along.',
    icon: `<svg viewBox="0 0 40 40" fill="none" stroke-width="2" stroke-linecap="round">
      <rect x="5" y="16" width="30" height="13" rx="2" fill="#1d6b48" stroke="#1d6b48"/>
      <rect x="10" y="12" width="20" height="10" rx="1.5" fill="#1f2329"/>
      <circle cx="31" cy="25" r="2" fill="#34c759"/>
      <path d="M14 17h10M21 14.5l3 2.5-3 2.5" stroke="#f2b705" stroke-width="1.6"/>
      <path d="M9 29v6M31 29v6" stroke="currentColor"/></svg>`,
    create: (id) => new Delay(id),
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
