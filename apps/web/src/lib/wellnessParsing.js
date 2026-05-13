export const LANGUAGE_OPTIONS = [
  { value: 'hi-IN', label: 'Hindi / Indian' },
  { value: 'en-IN', label: 'English' },
];

export const ACTIVITY_FIELDS = [
  { key: 'runningMinutes', label: 'Running time', unit: 'mins', color: '#ff7a59', step: 1 },
  { key: 'runningDistanceKm', label: 'Running distance', unit: 'km', color: '#fb7185', step: 0.1 },
  { key: 'cyclingMinutes', label: 'Cycling time', unit: 'mins', color: '#60a5fa', step: 1 },
  { key: 'walkingMinutes', label: 'Walking time', unit: 'mins', color: '#a3e635', step: 1 },
  { key: 'walkingDistanceKm', label: 'Walking distance', unit: 'km', color: '#84cc16', step: 0.1 },
  { key: 'exerciseMinutes', label: 'Workout', unit: 'mins', color: '#f59e0b', step: 1 },
  { key: 'yogaMinutes', label: 'Yoga', unit: 'mins', color: '#fbbf24', step: 1 },
  { key: 'badmintonMinutes', label: 'Badminton', unit: 'mins', color: '#eab308', step: 1 },
  { key: 'footballMinutes', label: 'Football', unit: 'mins', color: '#22c55e', step: 1 },
  { key: 'cricketMinutes', label: 'Cricket', unit: 'mins', color: '#8b5cf6', step: 1 },
  { key: 'swimmingMinutes', label: 'Swimming', unit: 'mins', color: '#0ea5e9', step: 1 },
  { key: 'meditationMinutes', label: 'Meditation', unit: 'mins', color: '#38bdf8', step: 1 },
  { key: 'whiskyPegs', label: 'Whisky', unit: 'pegs', color: '#f97316', step: 1 },
  { key: 'fastFoodServings', label: 'Fast food', unit: 'count', color: '#ef4444', step: 1 },
  { key: 'sugarServings', label: 'Sugar', unit: 'count', color: '#ec4899', step: 1 },
  { key: 'headacheLevel', label: 'Headache', unit: '/10', color: '#a78bfa', step: 1 },
  { key: 'sleepHours', label: 'Sleep', unit: 'hrs', color: '#818cf8', step: 0.5 },
];

export const DEFAULT_FORM = {
  date: new Date().toISOString().slice(0, 10),
  runningMinutes: 0,
  runningDistanceKm: 0,
  cyclingMinutes: 0,
  walkingMinutes: 0,
  walkingDistanceKm: 0,
  exerciseMinutes: 0,
  yogaMinutes: 0,
  badmintonMinutes: 0,
  footballMinutes: 0,
  cricketMinutes: 0,
  swimmingMinutes: 0,
  meditationMinutes: 0,
  whiskyPegs: 0,
  fastFoodServings: 0,
  sugarServings: 0,
  headacheLevel: 0,
  headacheType: '',
  headacheNotes: '',
  sleepHours: 0,
  moodScore: 7,
  notes: '',
  trackingStartedAt: null,
};

const DEVANAGARI_DIGITS = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5,
  chhe: 6, saat: 7, aath: 8, nau: 9, dus: 10, das: 10,
  gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20,
  tees: 30, chalis: 40, pachaas: 50, saath: 60,
};

export function normalizeDigits(text) {
  return String(text || '').replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS[digit] || digit);
}

export function extractSpokenNumber(text) {
  const normalized = normalizeDigits(text).toLowerCase();
  const direct = normalized.match(/\d+(?:\.\d+)?/);
  if (direct) return Number(direct[0]);

  const tokens = normalized.split(/[^a-z\u0900-\u097f]+/i).filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const current = NUMBER_WORDS[tokens[index]];
    const next = NUMBER_WORDS[tokens[index + 1]];
    if (current != null && next != null && current >= 20 && next < 10) {
      return current + next;
    }
    if (current != null) return current;
  }

  return null;
}

export function readMetricNearTerms(text, terms) {
  const normalized = normalizeDigits(text);
  const termPattern = terms.map((term) => term.trim()).filter(Boolean).join('|');
  const patterns = [
    new RegExp(`(?:${termPattern})(?:\\s+(?:for|ke|ki|mein|me|in))?\\s+([^.,;\\n]+)`, 'i'),
    new RegExp(`([^.,;\\n]+?)\\s*(?:minutes|minute|mins|min|km|kilometer|kilometers|kilometre|kilometres|liters|litres|liter|litre|l|peg|pegs|count)?\\s*(?:of\\s+)?(?:${termPattern})`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = extractSpokenNumber(match[1]);
    if (value != null) return value;
  }

  return null;
}

export function extractDurationMinutes(text) {
  const normalized = normalizeDigits(text).toLowerCase();
  let minutes = 0;

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?|[a-z\u0900-\u097f]+)\s*(?:hour|hours|hr|hrs|ghanta|ghante)/i);
  if (hourMatch) {
    const hours = extractSpokenNumber(hourMatch[1]);
    if (hours != null) minutes += Number(hours) * 60;
  }

  const minuteMatch = normalized.match(/(\d+(?:\.\d+)?|[a-z\u0900-\u097f]+)\s*(?:minute|minutes|min|mins)/i);
  if (minuteMatch) {
    const parsedMinutes = extractSpokenNumber(minuteMatch[1]);
    if (parsedMinutes != null) minutes += Number(parsedMinutes);
  }

  return minutes || null;
}

export function formatMetric(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '0';
  return Number.isInteger(Number(amount)) ? String(Number(amount)) : String(Number(Number(amount).toFixed(1)));
}

export function formatUpdateList(updates) {
  return updates.map((update) => {
    const value = update?.value;
    const numericValue = Number(value);
    if (value !== '' && value != null && Number.isFinite(numericValue) && String(value).trim() !== '' && `${value}` !== 'NaN') {
      return `${update.label} ${formatMetric(numericValue)} ${update.unit || ''}`.trim();
    }
    return `${update.label} ${String(value || '').trim()}`.trim();
  }).filter(Boolean).join(', ');
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function parseActivityCommand(form, message) {
  const text = normalizeDigits(message).toLowerCase();
  const next = { ...form };
  const updates = [];

  const runningMentioned = /\b(run|running|jog|jogging|दौड़|दौड़|bhaag|bhaagna)\b/i.test(text);
  const cyclingMentioned = /\b(cycle|cycling|bike|biking|ride|riding|साइकिल)\b/i.test(text);
  const walkingMentioned = /\b(walk|walking|stroll|chal|chalna|टहल|पैदल)\b/i.test(text);
  const runningMinutes = runningMentioned ? extractDurationMinutes(text) : null;
  const runningDistance = runningMentioned ? readMetricNearTerms(text, ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'किलोमीटर']) : null;
  const cyclingMinutes = cyclingMentioned ? extractDurationMinutes(text) : null;
  const walkingMinutes = walkingMentioned ? extractDurationMinutes(text) : null;
  const walkingDistance = walkingMentioned ? readMetricNearTerms(text, ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'किलोमीटर']) : null;

  if (runningMentioned && runningMinutes != null) next.runningMinutes = runningMinutes;
  if (runningMentioned && runningDistance != null) next.runningDistanceKm = runningDistance;
  if (cyclingMentioned && cyclingMinutes != null) next.cyclingMinutes = cyclingMinutes;
  if (walkingMentioned && walkingMinutes != null) next.walkingMinutes = walkingMinutes;
  if (walkingMentioned && walkingDistance != null) next.walkingDistanceKm = walkingDistance;

  const mappings = [
    { key: 'exerciseMinutes', label: 'Workout', unit: 'mins', terms: ['exercise', 'workout', 'gym', 'training', 'kasrat', 'व्यायाम', 'कसरत'] },
    { key: 'yogaMinutes', label: 'Yoga', unit: 'mins', terms: ['yoga', 'asan', 'asanas', 'surya namaskar', 'योग'] },
    { key: 'badmintonMinutes', label: 'Badminton', unit: 'mins', terms: ['badminton'] },
    { key: 'footballMinutes', label: 'Football', unit: 'mins', terms: ['football', 'soccer'] },
    { key: 'cricketMinutes', label: 'Cricket', unit: 'mins', terms: ['cricket'] },
    { key: 'swimmingMinutes', label: 'Swimming', unit: 'mins', terms: ['swimming', 'swim'] },
    { key: 'meditationMinutes', label: 'Meditation', unit: 'mins', terms: ['meditation', 'meditate', 'breathing', 'dhyan', 'ध्यान'] },
    { key: 'whiskyPegs', label: 'Whisky', unit: 'pegs', terms: ['whisky', 'whiskey', 'peg', 'pegs'] },
    { key: 'fastFoodServings', label: 'Fast food', unit: 'count', terms: ['fast food', 'burger', 'pizza', 'junk food'] },
    { key: 'sugarServings', label: 'Sugar', unit: 'count', terms: ['sugar', 'sweet', 'dessert'] },
    { key: 'headacheLevel', label: 'Headache', unit: '/10', terms: ['headache', 'sir dard', 'सिर दर्द'] },
    { key: 'sleepHours', label: 'Sleep', unit: 'hrs', terms: ['sleep', 'slept', 'neend', 'soya', 'नींद'] },
  ];

  mappings.forEach((mapping) => {
    const value = readMetricNearTerms(text, mapping.terms);
    if (value != null) next[mapping.key] = value;
  });

  const moodValue = readMetricNearTerms(text, ['mood', 'feeling', 'feel']);
  if (moodValue != null) next.moodScore = moodValue;

  if (/\b(note|notes|remark)\b/i.test(text)) {
    next.notes = String(message || '').trim();
  }

  [
    ['runningMinutes', 'Running time', 'mins'],
    ['runningDistanceKm', 'Running distance', 'km'],
    ['cyclingMinutes', 'Cycling time', 'mins'],
    ['walkingMinutes', 'Walking time', 'mins'],
    ['walkingDistanceKm', 'Walking distance', 'km'],
    ['exerciseMinutes', 'Workout', 'mins'],
    ['yogaMinutes', 'Yoga', 'mins'],
    ['badmintonMinutes', 'Badminton', 'mins'],
    ['footballMinutes', 'Football', 'mins'],
    ['cricketMinutes', 'Cricket', 'mins'],
    ['swimmingMinutes', 'Swimming', 'mins'],
    ['meditationMinutes', 'Meditation', 'mins'],
    ['whiskyPegs', 'Whisky', 'pegs'],
    ['fastFoodServings', 'Fast food', 'count'],
    ['sugarServings', 'Sugar', 'count'],
    ['headacheLevel', 'Headache', '/10'],
    ['sleepHours', 'Sleep', 'hrs'],
    ['moodScore', 'Mood', '/10'],
  ].forEach(([key, label, unit]) => {
    if (Number(next[key] || 0) !== Number(form[key] || 0)) {
      updates.push({ key, label, unit, value: next[key] });
    }
  });

  return { nextForm: next, updates };
}