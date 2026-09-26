// Photo-derived procedural models (img2threejs-style), keyed by AssemblyPart.model.
// Frame: metres, y-up, the wearer/object stands on y=0 facing +z. Each builder returns a
// Group whose origin is the part's attachment point, so AssemblyView can place it at part.pos.
// A builder returning null means "not ready": AssemblyView falls back to the primitive.
import type { Object3D } from 'three';

export const MODELS: Record<string, () => Promise<Object3D | null>> = {
  'superman.cape': () => import('./cape').then((m) => m.buildCape()),
  'superman.emblem': () => import('./emblem').then((m) => m.buildEmblem()),
  'superman.belt': () => import('./belt').then((m) => m.buildBelt()),
  'superman.boots': () => import('./boots').then((m) => m.buildBoots()),
  'superman.suit': () => import('./suit').then((m) => m.buildSuit()),
};
