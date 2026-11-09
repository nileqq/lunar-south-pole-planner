// Static facts for each selectable object.

export const TEST_STATION = {
  name: 'Test Station · Trans-Ili Alatau',
  lat: 43.05,
  lon: 76.98,
  elevation: 2510,
  tz: 5, // UTC+5
};

export const LUNAR_SITE = {
  name: 'Shackleton Rim',
  lat: -89.9,
  lon: 0,
};

export const CATALOG = {
  sun: {
    id: 'sun',
    name: 'Sun',
    kind: 'G2V star',
    color: '#f5a524',
    description:
      'The only energy source for a lunar south pole lander. Near the pole it never rises high — it skims the horizon, so a ridge a few hundred metres tall can hide it for days.',
    facts: [
      ['Radius', '696,340 km'],
      ['Surface temp.', '5,772 K'],
      ['Luminosity', '3.83 × 10²⁶ W'],
      ['Solar constant', '1,361 W/m²'],
    ],
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    kind: 'Planet · validation ground',
    color: '#5aa9ff',
    description:
      'We cannot test the prediction on the Moon, so we test it in mountains on Earth. A camera station records the real sunrise every morning and we compare it with the simulation.',
    facts: [
      ['Radius', '6,371 km'],
      ['Axial tilt', '23.44°'],
      ['Day', '23 h 56 min'],
      ['Distance to Sun', '1 AU · 149.6 M km'],
    ],
    children: ['station'],
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    kind: 'Natural satellite · target',
    color: '#c9ced8',
    description:
      'Its axis is tilted only 1.54°, so at the south pole the Sun circles along the horizon. Whether a site gets power depends on when the Sun clears the surrounding peaks.',
    facts: [
      ['Radius', '1,737 km'],
      ['Axial tilt', '1.54°'],
      ['Orbit', '27.32 days'],
      ['Distance', '384,400 km'],
    ],
    children: ['southpole'],
  },
  station: {
    id: 'station',
    name: 'Test Station',
    parent: 'earth',
    kind: 'Field camera · Earth analogue',
    color: '#5aa9ff',
    description:
      'Camera device in the mountains. Each morning it records the moment the Sun appears over the ridge. Its log is overlaid on the predicted sunrise to measure the error.',
    facts: [
      ['Location', '43.05° N, 76.98° E'],
      ['Elevation', '2,510 m'],
      ['Time zone', 'UTC+5'],
      ['Horizon', 'synthetic (DEM pending)'],
    ],
  },
  southpole: {
    id: 'southpole',
    name: 'Lunar South Pole',
    parent: 'moon',
    kind: 'Landing region · Shackleton rim',
    color: '#f5a524',
    description:
      'Candidate landing region. The Sun stays within about ±1.6° of the horizon, so illumination is decided by local terrain.',
    facts: [
      ['Location', '89.9° S'],
      ['Sun elevation range', '≈ −1.6° … +1.6°'],
      ['Horizon', 'synthetic (LOLA pending)'],
      ['Day/night cycle', '29.5 days'],
    ],
  },
};

export const ORDER = ['sun', 'earth', 'station', 'moon', 'southpole'];
