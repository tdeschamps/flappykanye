// pos: aperture center in 0..1 screen coords
// size: half-axes of the rounded rect (width, height)
// radius: 0 = square corners, 0.5 = perfect circle/ellipse when w==h
export const CHAMBERS = [
  { name: 'CHAMBER I — AFRUM',     a: '#1a0d2a', b: '#6e2bd1', accent: '#f9d34a',
    pos: [0.50, 0.55], size: [0.62, 0.42], radius: 0.012 },  // wide rectangle
  { name: 'CHAMBER II — RAEMAR',   a: '#0a1e2e', b: '#1a7fb0', accent: '#ebe6dc',
    pos: [0.50, 0.50], size: [0.38, 0.38], radius: 0.02 },   // softened square
  { name: 'CHAMBER III — ROETHKO', a: '#2a0606', b: '#b8231c', accent: '#0a0a0a',
    pos: [0.50, 0.45], size: [0.55, 0.62], radius: 0.06 },   // tall portal
  { name: 'CHAMBER IV — GANZFELD', a: '#f3ead8', b: '#d9b27a', accent: '#0a0a0a',
    pos: [0.50, 0.50], size: [0.32, 0.32], radius: 0.32 },   // perfect circle
  { name: 'CHAMBER V — KAMUELA',   a: '#04141a', b: '#1c5a5a', accent: '#c7f9a8',
    pos: [0.50, 0.55], size: [0.50, 0.22], radius: 0.18 },   // wide ellipse slot
  { name: 'CHAMBER VI — VOID',     a: '#000000', b: '#1a1a1a', accent: '#b8231c',
    pos: [0.50, 0.50], size: [0.08, 0.85], radius: 0.04 },   // narrow vertical slit
];

export function chamberFor(score) {
  const idx = score / 5;
  const i = Math.floor(idx) % CHAMBERS.length;
  const j = (i + 1) % CHAMBERS.length;
  const t = idx - Math.floor(idx);
  return { from: CHAMBERS[i], to: CHAMBERS[j], t, idx: i };
}
