/**
 * GIF catalog + search for Cosmix thread chat.
 * Uses Giphy (env key or public SDK fallback) + curated local pack.
 * Related query expansions give lots of options (baby → baby crying, baby airplane…).
 */

const GIPHY_PUBLIC_SDK_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';

const PACK = [
  { id: 'wave', tags: 'hello hi wave greeting', url: 'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif', preview: 'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/200w.gif' },
  { id: 'hi2', tags: 'hello hi hey', url: 'https://media.giphy.com/media/XD9o33QG9BoMarGLVr/giphy.gif', preview: 'https://media.giphy.com/media/XD9o33QG9BoMarGLVr/200w.gif' },
  { id: 'thumb', tags: 'ok yes thumbs good', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', preview: 'https://media.giphy.com/media/111ebonMs90YLu/200w.gif' },
  { id: 'clap', tags: 'clap applause bravo', url: 'https://media.giphy.com/media/7rj2Zg2X0eJW0/giphy.gif', preview: 'https://media.giphy.com/media/7rj2Zg2X0eJW0/200w.gif' },
  { id: 'fire', tags: 'fire lit hot wow', url: 'https://media.giphy.com/media/l0MYC0LajbEwR1pWs/giphy.gif', preview: 'https://media.giphy.com/media/l0MYC0LajbEwR1pWs/200w.gif' },
  { id: 'party', tags: 'party celebrate confetti', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', preview: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif' },
  { id: 'dance', tags: 'dance happy groove', url: 'https://media.giphy.com/media/l0M9z4vP5o1lKp1Ms/giphy.gif', preview: 'https://media.giphy.com/media/l0M9z4vP5o1lKp1Ms/200w.gif' },
  { id: 'lol', tags: 'lol laugh funny haha', url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', preview: 'https://media.giphy.com/media/10JhviFuU2gWD6/200w.gif' },
  { id: 'love', tags: 'love heart like', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', preview: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/200w.gif' },
  { id: 'wow', tags: 'wow amazed shocked', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', preview: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200w.gif' },
  { id: 'cry', tags: 'sad cry tears baby crying', url: 'https://media.giphy.com/media/ROF8OQvDgtEQ0/giphy.gif', preview: 'https://media.giphy.com/media/ROF8OQvDgtEQ0/200w.gif' },
  { id: 'run', tags: 'run running sprint sport', url: 'https://media.giphy.com/media/l0HlNQ03J5JxX6lva/giphy.gif', preview: 'https://media.giphy.com/media/l0HlNQ03J5JxX6lva/200w.gif' },
  { id: 'cat', tags: 'cat cute funny', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', preview: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/200w.gif' },
  { id: 'dog', tags: 'dog cute happy', url: 'https://media.giphy.com/media/l2JehQ2LutZZl29i0/giphy.gif', preview: 'https://media.giphy.com/media/l2JehQ2LutZZl29i0/200w.gif' },
  { id: 'excited', tags: 'excited hype energy', url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', preview: 'https://media.giphy.com/media/5GoVLqeAOo6PK/200w.gif' },
  { id: 'hug', tags: 'hug care love friend', url: 'https://media.giphy.com/media/l2QDM9Jnim1YVILXa/giphy.gif', preview: 'https://media.giphy.com/media/l2QDM9Jnim1YVILXa/200w.gif' },
  { id: 'baby1', tags: 'baby cute infant toddler', url: 'https://media.giphy.com/media/IqojY0rgVWfOE/giphy.gif', preview: 'https://media.giphy.com/media/IqojY0rgVWfOE/200w.gif' },
  { id: 'baby2', tags: 'baby spinning cute toddler', url: 'https://media.giphy.com/media/XweOsBl72PFcc/giphy.gif', preview: 'https://media.giphy.com/media/XweOsBl72PFcc/200w.gif' },
  { id: 'baby3', tags: 'baby toddler meme', url: 'https://media.giphy.com/media/HKXRzTd7QYt0l5Tcuw/giphy.gif', preview: 'https://media.giphy.com/media/HKXRzTd7QYt0l5Tcuw/200w.gif' },
];

const TRENDING_QUERIES = [
  'hello', 'lol', 'love', 'fire', 'clap', 'wow', 'run', 'party', 'thanks', 'bye',
  'yes', 'cool', 'hug', 'dance', 'excited', 'baby', 'baby crying', 'baby airplane', 'cat', 'dog',
];

/** Related search phrases keyed by root word. */
const RELATED_BY_ROOT = {
  baby: [
    'baby', 'baby crying', 'baby laughing', 'baby dancing', 'baby airplane',
    'baby yawning', 'cute baby', 'baby clap', 'baby wave', 'happy baby',
    'baby eating', 'baby surprised', 'toddler dance',
  ],
  cry: ['crying', 'baby crying', 'sad cry', 'tears', 'sobbing'],
  love: ['love', 'hearts', 'kiss', 'hug', 'i love you', 'heart eyes'],
  lol: ['lol', 'laughing', 'haha', 'funny', 'rofl', 'lmao'],
  run: ['run', 'running', 'sprint', 'marathon', 'jogging'],
  dance: ['dance', 'dancing', 'groove', 'party dance', 'happy dance'],
  cat: ['cat', 'cute cat', 'cat funny', 'kitten', 'cat reaction'],
  dog: ['dog', 'puppy', 'dog happy', 'good boy', 'dog funny'],
  hello: ['hello', 'hi', 'hey', 'wave', 'good morning'],
  bye: ['bye', 'goodbye', 'see you', 'later', 'bye bye'],
  wow: ['wow', 'omg', 'amazed', 'mind blown', 'shocked'],
  yes: ['yes', 'yay', 'ok', 'thumbs up', 'agree'],
  no: ['no', 'nope', 'nah', 'shake head'],
  fire: ['fire', 'lit', 'on fire', 'hot'],
  party: ['party', 'celebrate', 'confetti', 'cheers'],
  thanks: ['thanks', 'thank you', 'grateful', 'appreciate'],
  coffee: ['coffee', 'tea', 'morning coffee', 'espresso'],
  sleep: ['sleep', 'tired', 'zzz', 'good night'],
  airplane: ['airplane', 'baby airplane', 'plane', 'flying', 'takeoff'],
  plane: ['airplane', 'baby airplane', 'plane', 'flying'],
};

function giphyKey() {
  return String(
    process.env.NEXT_PUBLIC_GIPHY_API_KEY
    || process.env.GIPHY_API_KEY
    || GIPHY_PUBLIC_SDK_KEY,
  ).trim();
}

function tenorKey() {
  return String(process.env.NEXT_PUBLIC_TENOR_API_KEY || process.env.TENOR_API_KEY || '').trim();
}

function normalizeGif(item) {
  if (!item?.url) return null;
  return {
    id: String(item.id || item.url),
    url: item.url,
    preview: item.preview || item.url,
    tags: String(item.tags || ''),
  };
}

function stableGiphyUrls(id) {
  return {
    url: `https://media.giphy.com/media/${id}/giphy.gif`,
    preview: `https://media.giphy.com/media/${id}/200w.gif`,
  };
}

export function searchLocalGifs(query = '', limit = 48) {
  const q = String(query || '').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const list = !q
    ? PACK
    : PACK.filter((g) => {
      const tags = g.tags;
      if (tags.includes(q)) return true;
      return words.every((w) => tags.includes(w)) || words.some((w) => tags.includes(w));
    });
  return list.slice(0, limit).map(normalizeGif).filter(Boolean);
}

export function trendingGifQueries() {
  return TRENDING_QUERIES.slice();
}

/** Chip suggestions for the current search text. */
export function suggestGifQueries(query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return TRENDING_QUERIES.slice(0, 16);

  const roots = Object.keys(RELATED_BY_ROOT);
  const matchedRoot = roots.find((root) => q === root || q.startsWith(`${root} `) || q.includes(root));
  const related = matchedRoot ? RELATED_BY_ROOT[matchedRoot] : [];

  const extras = [
    q,
    `${q} funny`,
    `${q} cute`,
    `${q} reaction`,
    `${q} meme`,
  ];

  const seen = new Set();
  const out = [];
  [...related, ...extras, ...TRENDING_QUERIES].forEach((item) => {
    const value = String(item || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out.slice(0, 18);
}

/** Expand one user query into several Giphy searches for more variety. */
function expandSearchQueries(query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return ['reactions', 'funny', 'hello', 'love', 'wow'];

  const suggestions = suggestGifQueries(q);
  const expanded = [q, ...suggestions.filter((s) => s.toLowerCase() !== q)].slice(0, 6);
  return expanded;
}

async function searchTenor(query, limit = 40) {
  const key = tenorKey();
  if (!key) return [];
  const q = encodeURIComponent(String(query || 'funny').trim() || 'funny');
  const url = `https://tenor.googleapis.com/v2/search?q=${q}&key=${encodeURIComponent(key)}&limit=${limit}&media_filter=gif`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.results || []).map((item) => normalizeGif({
    id: item.id,
    url: item.media_formats?.gif?.url || item.media_formats?.mediumgif?.url,
    preview: item.media_formats?.tinygif?.url || item.media_formats?.nanogif?.url,
    tags: (item.content_description || item.title || query || '').toLowerCase(),
  })).filter(Boolean);
}

async function searchGiphyOnce(query, limit = 40) {
  const key = giphyKey();
  if (!key) return [];
  const q = encodeURIComponent(String(query || 'funny').trim() || 'funny');
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${q}&limit=${limit}&rating=pg-13&lang=en`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.data || []).map((item) => {
    const id = item.id;
    const stable = id ? stableGiphyUrls(id) : null;
    return normalizeGif({
      id,
      url: stable?.url || item.images?.original?.url || item.images?.downsized?.url,
      preview: stable?.preview || item.images?.fixed_width_small?.url || item.images?.preview_gif?.url,
      tags: `${item.title || ''} ${query || ''}`.toLowerCase(),
    });
  }).filter(Boolean);
}

async function searchGiphyExpanded(query, limit = 80) {
  const queries = expandSearchQueries(query);
  const perQuery = Math.max(12, Math.ceil(limit / Math.max(1, queries.length)));
  const batches = await Promise.all(
    queries.map((q) => searchGiphyOnce(q, perQuery).catch(() => [])),
  );
  return batches.flat();
}

function mergeGifs(lists, limit) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((gif) => {
    if (!gif?.url || seen.has(gif.url) || seen.has(gif.id)) return;
    seen.add(gif.url);
    if (gif.id) seen.add(gif.id);
    merged.push(gif);
  });
  return merged.slice(0, limit);
}

/** Merge local pack + remote APIs; expands related queries for lots of options. */
export async function searchGifs(query = '', limit = 96) {
  const local = searchLocalGifs(query, 24);
  const [giphy, tenor] = await Promise.all([
    searchGiphyExpanded(query, limit).catch(() => []),
    searchTenor(query || 'reactions', Math.min(40, limit)).catch(() => []),
  ]);
  return mergeGifs([giphy, tenor, local], limit);
}
