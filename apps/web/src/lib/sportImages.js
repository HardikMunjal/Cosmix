/**
 * Sport-specific images only — badminton posts use badminton photos, etc.
 * URLs are verified Pexels CDN links (200 OK).
 */

function pexels(id) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200&h=720&fit=crop`;
}

export const SPORT_IMAGES = {
  marathon: [
    pexels(2402777),
    pexels(28907552),
    pexels(35388277),
    pexels(35599356),
  ],
  running: [
    pexels(31675723),
    pexels(13159246),
    pexels(32996794),
    pexels(36541474),
    pexels(5457970),
  ],
  badminton: [
    pexels(12886742),
    pexels(8007417),
    pexels(35246263),
    pexels(8007411),
    pexels(34910395),
  ],
  cycling: [
    pexels(18823756),
    pexels(20500972),
    pexels(30316461),
    pexels(28810901),
  ],
  walking: [
    pexels(37273668),
    pexels(37855557),
    pexels(36598411),
  ],
  swimming: [
    pexels(6011876),
    pexels(30049366),
    pexels(31820085),
    pexels(13579965),
    pexels(3775140),
  ],
  football: [
    pexels(38024072),
    pexels(36958062),
    pexels(38024089),
    pexels(37996637),
  ],
  strength: [
    pexels(14007903),
    pexels(20769890),
    pexels(16779470),
    pexels(31500861),
  ],
  yoga: [
    pexels(7663234),
    pexels(3822525),
    pexels(3822688),
    pexels(4938111),
  ],
  default: [
    pexels(31675723),
  ],
};

const SPORT_ALIASES = {
  marathon: ['marathon', 'ultra', 'half marathon', 'half-marathon'],
  running: ['running', 'run', 'jog', 'jogging', 'sprint', 'track'],
  badminton: ['badminton', 'shuttle', 'shuttlecock'],
  cycling: ['cycling', 'cycle', 'bike', 'biking', 'bicycle'],
  walking: ['walking', 'walk', 'hike', 'hiking', 'trek'],
  swimming: ['swimming', 'swim', 'pool', 'laps'],
  football: ['football', 'soccer'],
  strength: ['strength', 'gym', 'weight', 'weights', 'exercise', 'workout', 'lifting'],
  yoga: ['yoga', 'pilates', 'stretch'],
};

const SPORT_MATCH_ORDER = [
  'marathon',
  'badminton',
  'swimming',
  'cycling',
  'football',
  'walking',
  'strength',
  'yoga',
  'running',
];

function matchesSportAlias(key, alias) {
  if (key === alias) return true;
  if (alias.length <= 3) {
    return new RegExp(`\\b${alias}\\b`).test(key);
  }
  return key.includes(alias);
}

export function normalizeSportKey(sport) {
  const key = String(sport || '').toLowerCase().trim();
  if (!key) return 'default';
  if (SPORT_IMAGES[key]) return key;

  for (const sportKey of SPORT_MATCH_ORDER) {
    const aliases = SPORT_ALIASES[sportKey] || [];
    if (aliases.some((alias) => matchesSportAlias(key, alias))) {
      return sportKey;
    }
  }

  return 'default';
}

function hashSeed(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function resolvePostSport(post = {}) {
  const candidates = [
    post.sport,
    post.activityType,
    post.title,
    post.body,
    post.kind,
  ];
  for (const value of candidates) {
    const sport = normalizeSportKey(value);
    if (sport !== 'default') return sport;
  }
  return 'default';
}

export function getSportImagePool(sport) {
  const key = normalizeSportKey(sport);
  return [...(SPORT_IMAGES[key] || SPORT_IMAGES.default)];
}

export function pickSportImage(sport, postId) {
  const pool = getSportImagePool(sport);
  return pool[hashSeed(postId) % pool.length];
}

export function getPostImageCandidates(post = {}) {
  const sport = resolvePostSport(post);
  const pool = getSportImagePool(sport);
  if (!pool.length) return { sport, candidates: SPORT_IMAGES.default };

  const slot = hashSeed(post.id) % pool.length;
  const candidates = [...pool.slice(slot), ...pool.slice(0, slot)];
  return { sport, candidates };
}

export function assignDistinctPostImages(posts = []) {
  const sportCounters = {};

  return posts.map((post) => {
    const sport = resolvePostSport(post);
    const pool = getSportImagePool(sport);
    if (sportCounters[sport] == null) sportCounters[sport] = 0;

    const slot = sportCounters[sport] % pool.length;
    sportCounters[sport] += 1;

    const imageUrl = pool[slot];
    const imageUrls = [...pool.slice(slot), ...pool.slice(0, slot)];

    return {
      ...post,
      sport,
      imageUrl,
      imageUrls,
      imageSlot: slot,
    };
  });
}

export function pickSportImageRandom(sport, excludeUrls = []) {
  const pool = getSportImagePool(sport);
  const exclude = new Set(Array.isArray(excludeUrls) ? excludeUrls : [excludeUrls].filter(Boolean));
  const available = pool.filter((url) => !exclude.has(url));
  if (!available.length) return pool[0];
  return available[Math.floor(Math.random() * available.length)];
}
