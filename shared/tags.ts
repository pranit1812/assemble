// Closed tag vocabulary. Seed data, the LLM decomposer and the merchant
// add-product form all use ONLY these tags, so scouts can match by tag.
export const TAGS = [
  // costume / superhero
  'costume', 'superhero', 'superman', 'superman-costume', 'halloween', 'kids', 'adult',
  'bodysuit', 'top', 'leggings', 'cape', 'emblem', 'boots', 'boot-covers', 'belt', 'mask', 'wig', 'hat',
  'witch', 'vampire', 'skeleton', 'pumpkin', 'face-paint',
  // colours / materials
  'red', 'blue', 'yellow', 'black', 'felt', 'fabric', 'satin', 'iron-on', 'vinyl', 'ribbon', 'elastic', 'velcro',
  // craft consumables & tools
  'fabric-glue', 'hot-glue', 'sewing', 'thread', 'scissors', 'paint', 'cardboard', 'template',
  // plant pot / maker
  'plant', 'pot', 'planter', 'self-watering', 'self-watering-pot', 'reservoir', 'inner-pot', 'wick', 'cotton-cord',
  'soil', 'potting-mix', 'bottle', 'terracotta', 'jar', 'water-level', 'float', 'herb', 'seedling',
  'sensor', 'moisture-sensor', 'microcontroller', 'esp32', 'arduino', 'led', 'usb', 'wires', 'jumper-wires',
  '3d-print', 'pla', 'drill', 'electronics', 'garden', 'craft', 'party', 'lights',
  // home organising / room decor
  'home', 'storage', 'shelf', 'shelf-riser', 'box', 'basket', 'crate', 'drawer', 'divider', 'hooks', 'rail', 'label', 'magazine-file', 'cable-tidy', 'wood', 'fabric-bin', 'wall-mount', 'tray', 'shelf-organiser-set',
] as const;
export type Tag = (typeof TAGS)[number];
export const isTag = (t: string): t is Tag => (TAGS as readonly string[]).includes(t);
