/**
 * Sport-specific images only — badminton posts use badminton photos, etc.
 * Sources: Pexels + Unsplash (direct CDN URLs).
 */

function pexels(id) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200&h=720&fit=crop`;
}

function unsplash(photoId) {
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=1200&h=720&q=80`;
}

export const SPORT_IMAGES = {
  running: [
    pexels(1571019),
    pexels(3764013),
    pexels(2526878),
    pexels(1557241),
    pexels(1461889),
    pexels(2409895),
    unsplash('1476480862128-209bf9258e58'),
    unsplash('1571008887538-b2cf49c5286e'),
  ],
  badminton: [
    pexels(12887090),
    pexels(5836877),
    pexels(3661450),
    pexels(4757482),
    unsplash('1626224583764-f87db4efaa7b'),
    unsplash('1612872087720-94dca6f9f714'),
    unsplash('1622167518454-d0be8ec59fc0'),
    unsplash('1592656091128-2f29c69d3c15'),
    unsplash('1554068865-24cecd4e24de'),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Shuttlecocks_L.jpg/1280px-Shuttlecocks_L.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Badminton_%28women%27s_doubles%29.jpg/1280px-Badminton_%28women%27s_doubles%29.jpg',
  ],
  cycling: [
    pexels(248547),
    pexels(276517),
    pexels(6802570),
    pexels(100582),
    pexels(2747946),
    pexels(2157850),
  ],
  walking: [
    pexels(147411),
    pexels(1687845),
    pexels(2409894),
    pexels(775201),
    pexels(775747),
    pexels(1730390),
  ],
  swimming: [
    pexels(1263349),
    pexels(2617986),
    pexels(7375532),
    pexels(1263348),
    pexels(3775141),
    pexels(2609000),
  ],
  football: [
    pexels(399187),
    pexels(4679168),
    pexels(274422),
    pexels(2745068),
    pexels(3621109),
    pexels(1145542),
  ],
  strength: [
    pexels(841130),
    pexels(1954524),
    pexels(1229356),
    pexels(791763),
    pexels(17840),
    pexels(4164760),
  ],
  yoga: [
    pexels(1051838),
    pexels(3822906),
    pexels(3094238),
    pexels(4056723),
    pexels(5385045),
    pexels(3822621),
  ],
  default: [
    pexels(841130),
    pexels(1571019),
    pexels(1051838),
  ],
};

export function normalizeSportKey(sport) {
  const key = String(sport || '').toLowerCase();
  if (key.includes('run')) return 'running';
  if (key.includes('badminton')) return 'badminton';
  if (key.includes('cycl') || key.includes('bike')) return 'cycling';
  if (key.includes('walk')) return 'walking';
  if (key.includes('swim')) return 'swimming';
  if (key.includes('football') || key.includes('soccer')) return 'football';
  if (key.includes('strength') || key.includes('gym') || key.includes('exercise')) return 'strength';
  if (key.includes('yoga')) return 'yoga';
  return SPORT_IMAGES[key] ? key : 'default';
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

export function pickSportImage(sport, postId) {
  const key = normalizeSportKey(sport);
  const pool = SPORT_IMAGES[key] || SPORT_IMAGES.default;
  return pool[hashSeed(postId) % pool.length];
}

export function assignDistinctPostImages(posts = []) {
  const sportCounters = {};

  return posts.map((post) => {
    const sport = normalizeSportKey(post.sport || post.activityType);
    const pool = [...(SPORT_IMAGES[sport] || SPORT_IMAGES.default)];
    if (sportCounters[sport] == null) sportCounters[sport] = 0;

    const slot = sportCounters[sport] % pool.length;
    sportCounters[sport] += 1;

    const imageUrl = pool[slot];
    const imageUrls = pool.slice(slot).concat(pool.slice(0, slot));

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
  const key = normalizeSportKey(sport);
  const exclude = new Set(Array.isArray(excludeUrls) ? excludeUrls : [excludeUrls].filter(Boolean));
  const pool = (SPORT_IMAGES[key] || SPORT_IMAGES.default).filter((url) => !exclude.has(url));
  if (!pool.length) return (SPORT_IMAGES[key] || SPORT_IMAGES.default)[0];
  return pool[Math.floor(Math.random() * pool.length)];
}
