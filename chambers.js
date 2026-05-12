export const CHAMBERS = [
  { name: 'CHAMBER I — AFRUM',     a: '#1a0d2a', b: '#6e2bd1', accent: '#f9d34a' },
  { name: 'CHAMBER II — RAEMAR',   a: '#0a1e2e', b: '#1a7fb0', accent: '#ebe6dc' },
  { name: 'CHAMBER III — ROETHKO', a: '#2a0606', b: '#b8231c', accent: '#0a0a0a' },
  { name: 'CHAMBER IV — GANZFELD', a: '#f3ead8', b: '#d9b27a', accent: '#0a0a0a' },
  { name: 'CHAMBER V — KAMUELA',   a: '#04141a', b: '#1c5a5a', accent: '#c7f9a8' },
  { name: 'CHAMBER VI — VOID',     a: '#000000', b: '#1a1a1a', accent: '#b8231c' },
];

export function chamberFor(score) {
  const idx = score / 5;
  const i = Math.floor(idx) % CHAMBERS.length;
  const j = (i + 1) % CHAMBERS.length;
  const t = idx - Math.floor(idx);
  return { from: CHAMBERS[i], to: CHAMBERS[j], t, idx: i };
}
