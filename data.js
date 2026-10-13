/**
 * DATA STRUCTURE
 * Each group: { groupId, title, description, triggerIndex, imageUrls[] }
 * - triggerIndex: which image in imageUrls acts as the hover "trigger" (default 0).
 * Replace the generated picsum URLs with your real artwork URLs (must be CORS-enabled).
 */
const TITLES = [
  ['Neon Nocturnes', 'Night photography drenched in sodium and neon.'],
  ['Salt & Stone', 'Coastal studies of erosion, texture and tide.'],
  ['Quiet Machines', 'Industrial forms rendered with a soft lens.'],
  ['Bloom Theory', 'Botanical abstractions in saturated colour.'],
  ['Concrete Poems', 'Brutalist architecture and its shadows.'],
  ['Desert Signals', 'Long-exposure light across empty land.'],
  ['Portraits in Blue', 'Faces captured in the blue hour.'],
  ['Winter Archive', 'Frozen landscapes and minimal horizons.'],
  ['Analog Dreams', 'Grain, light leaks and expired film.'],
  ['Urban Geometry', 'Lines, grids and repetition in the city.'],
  ['Wild Interiors', 'Rooms reclaimed by plants and time.'],
  ['Ocean Memory', 'The sea as rhythm, colour and noise.'],
];

const IMAGES_PER_GROUP = 18;
const AMBIENT_IMAGES = 180; // ungrouped background particles

export const groups = TITLES.map(([title, description], g) => ({
  groupId: `group-${g}`,
  title,
  description,
  triggerIndex: 0,
  imageUrls: Array.from({ length: IMAGES_PER_GROUP }, (_, i) =>
    `https://picsum.photos/seed/au-${g}-${i}/128/128`),
}));

export const ambientImageUrls = Array.from({ length: AMBIENT_IMAGES }, (_, i) =>
  `https://picsum.photos/seed/au-amb-${i}/128/128`);
