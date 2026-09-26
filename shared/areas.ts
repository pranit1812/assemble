// Hardcoded London areas for the "where are you?" picker. Coordinates are real-ish centroids.
export type Area = { id: string; name: string; postcode: string; lat: number; lng: number };
export const AREAS: Area[] = [
  { id: 'hackney', name: 'Hackney', postcode: 'E8', lat: 51.5450, lng: -0.0553 },
  { id: 'dalston', name: 'Dalston', postcode: 'E8', lat: 51.5462, lng: -0.0751 },
  { id: 'shoreditch', name: 'Shoreditch', postcode: 'E1', lat: 51.5265, lng: -0.0798 },
  { id: 'bethnal-green', name: 'Bethnal Green', postcode: 'E2', lat: 51.5270, lng: -0.0550 },
  { id: 'stoke-newington', name: 'Stoke Newington', postcode: 'N16', lat: 51.5620, lng: -0.0750 },
  { id: 'islington', name: 'Islington', postcode: 'N1', lat: 51.5362, lng: -0.1033 },
  { id: 'kings-cross', name: "King's Cross", postcode: 'N1C', lat: 51.5308, lng: -0.1238 },
  { id: 'camden', name: 'Camden', postcode: 'NW1', lat: 51.5390, lng: -0.1426 },
  { id: 'clerkenwell', name: 'Clerkenwell', postcode: 'EC1', lat: 51.5246, lng: -0.1100 },
  { id: 'soho', name: 'Soho', postcode: 'W1', lat: 51.5136, lng: -0.1365 },
  { id: 'peckham', name: 'Peckham', postcode: 'SE15', lat: 51.4740, lng: -0.0690 },
  { id: 'brixton', name: 'Brixton', postcode: 'SW9', lat: 51.4613, lng: -0.1156 },
  { id: 'walthamstow', name: 'Walthamstow', postcode: 'E17', lat: 51.5830, lng: -0.0200 },
  { id: 'stratford', name: 'Stratford', postcode: 'E15', lat: 51.5416, lng: -0.0033 },
];
export const DEFAULT_AREA = AREAS[0];
export const findArea = (q: string) => {
  const s = q.trim().toLowerCase();
  return AREAS.find((a) => a.id === s || a.name.toLowerCase() === s || a.postcode.toLowerCase() === s) ?? AREAS.find((a) => a.name.toLowerCase().includes(s) || s.startsWith(a.postcode.toLowerCase()));
};
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
}
