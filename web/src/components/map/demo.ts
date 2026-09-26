// Sample NearbyMap block for testing the map in isolation. Coordinates are real Hackney/Dalston streets;
// shop names are invented. Distances are computed from the shopper centre so they stay consistent.
import type { BlockOf } from '@shared/genui';
import { AREAS, km } from '@shared/areas';

const hackney = AREAS.find((a) => a.id === 'hackney')!;
const here = { lat: hackney.lat, lng: hackney.lng };

type Pin = BlockOf<'NearbyMap'>['pins'][number];
const pin = (p: Omit<Pin, 'distanceKm'>): Pin => ({ ...p, distanceKm: km(here, p) });

export const demoNearbyMap: BlockOf<'NearbyMap'> = {
  type: 'NearbyMap',
  center: [hackney.lat, hackney.lng],
  areaLabel: `${hackney.name} ${hackney.postcode}`,
  pins: [
    pin({ id: 'listing:s1', lat: 51.5392, lng: -0.0562, label: 'Mare Street Thrift', sub: 'Red cape · £4', tag: 'Secondhand', componentId: 'cape', picked: true }),
    pin({ id: 'merchant:m1', lat: 51.5368, lng: -0.0615, label: 'Broadway Market Haberdashery', sub: 'Gold felt, 1 m · £3.50', tag: 'Local', componentId: 'emblem' }),
    pin({ id: 'listing:s2', lat: 51.5487, lng: -0.0751, label: 'Dalston Vintage Rail', sub: 'Black boots, size 1 · £8', tag: 'Secondhand', componentId: 'boots' }),
    pin({ id: 'merchant:m2', lat: 51.5536, lng: -0.0437, label: 'Chatsworth Road Hardware', sub: 'Elastic & poppers · £2', tag: 'Local', componentId: 'belt' }),
    pin({ id: 'listing:s3', lat: 51.5584, lng: -0.0552, label: 'Clapton Kids Swap', sub: 'Blue leggings, age 7 · £2', tag: 'Secondhand', componentId: 'leggings' }),
    pin({ id: 'merchant:m3', lat: 51.5479, lng: -0.0724, label: 'Ridley Road Fabrics', sub: 'Satin offcuts · £1.50', tag: 'Local', componentId: 'cape' }),
    pin({ id: 'listing:s4', lat: 51.5436, lng: -0.064, label: 'Sam, London Fields', sub: 'Eye mask · free', tag: 'Secondhand', componentId: 'mask' }),
  ],
};

/** Edge case: nothing found yet. */
export const demoNearbyMapEmpty: BlockOf<'NearbyMap'> = { ...demoNearbyMap, pins: [] };
