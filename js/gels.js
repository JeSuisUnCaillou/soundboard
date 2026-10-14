// Pad colours, named after the lighting gels a theatre already has in a drawer.
// Eleven of them, which is what a sound op gets to colour-code a show with.

export const GELS = [
  { id: 'bastard-amber', name: 'Bastard Amber',  number: 'L162', hex: '#f3c38a' },
  { id: 'straw',         name: 'Straw',          number: 'L103', hex: '#f2da7d' },
  { id: 'lime',          name: 'Lime Green',     number: 'L088', hex: '#bcd451' },
  { id: 'moss',          name: 'Moss Green',     number: 'L089', hex: '#6fae63' },
  { id: 'steel',         name: 'Steel Blue',     number: 'R064', hex: '#86c3dc' },
  { id: 'daylight',      name: 'Daylight Blue',  number: 'R065', hex: '#5f9fd8' },
  { id: 'congo',         name: 'Congo Blue',     number: 'R382', hex: '#7b7fe0' },
  { id: 'lavender',      name: 'Lavender',       number: 'L058', hex: '#c3a3dd' },
  { id: 'surprise-pink', name: 'Surprise Pink',  number: 'R339', hex: '#f0a2c6' },
  { id: 'fire',          name: 'Fire',           number: 'L019', hex: '#f08a4b' },
  { id: 'primary-red',   name: 'Primary Red',    number: 'R027', hex: '#e2554a' },
];

const BY_ID = new Map(GELS.map((g) => [g.id, g]));

// Every pad starts the same colour. A gel means something when it is chosen.
export const DEFAULT_GEL = 'daylight';

export function gel(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_GEL);
}

export function gelHex(id) {
  return gel(id).hex;
}
