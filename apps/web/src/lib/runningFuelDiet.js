/**
 * Evidence-based running fuel / diet targets for Cosmix Coach.
 *
 * Sources (guidelines, not medical advice):
 * - ACSM / Academy of Nutrition & Dietetics / Dietitians of Canada joint position:
 *   CHO 5–12 g/kg/day by training load; protein 1.2–2.0 g/kg/day; fat ~20–35% energy.
 * - ISSN nutrient timing: peri-run CHO 30–60 g/h for >60–70 min hard work;
 *   post-run protein ~0.25–0.3 g/kg (≈20–40 g) within 0–2 h.
 * - NIH ODS iron RDA: men 8 mg/day; women 19–50 y 18 mg/day; vegetarians ×1.8.
 * - Endurance runners often need higher iron attention (foot-strike hemolysis, sweat);
 *   food-first; supplements only with bloodwork / clinician.
 *
 * Default body mass 70 kg when unknown — all gram targets scale with kg.
 */

export const DEFAULT_BODY_KG = 70;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}

/** Classify training day from today's / next planned session. */
export function classifyRunFuelDay({ weekKm = 0, lastRunKm = 0, lastRunMinutes = 0, gapDays = null } = {}) {
  const km = Number(lastRunKm) || 0;
  const mins = Number(lastRunMinutes) || 0;
  const weekly = Number(weekKm) || 0;

  if (gapDays != null && gapDays >= 2 && km < 0.1) {
    return { key: 'rest', label: 'Rest / easy day', intensity: 'low' };
  }
  if (km >= 15 || mins >= 90 || weekly >= 50) {
    return { key: 'long', label: 'Long / high volume', intensity: 'high' };
  }
  if (km >= 8 || mins >= 50 || weekly >= 30) {
    return { key: 'moderate', label: 'Moderate training', intensity: 'moderate' };
  }
  if (km >= 3 || mins >= 25) {
    return { key: 'easy', label: 'Easy / short run', intensity: 'low' };
  }
  return { key: 'base', label: 'Base / light week', intensity: 'low' };
}

/**
 * Daily macros & iron for a body mass + training day.
 * Returns grams (and iron mg) with clear ranges.
 */
export function buildDailyFuelTargets(bodyKg = DEFAULT_BODY_KG, day = { key: 'moderate' }) {
  const kg = clamp(Number(bodyKg) || DEFAULT_BODY_KG, 40, 140);
  const key = day?.key || 'moderate';

  // CHO g/kg/day (ACSM/AND/DC style bands)
  const choPerKg = {
    rest: [3, 5],
    base: [4, 5],
    easy: [5, 6],
    moderate: [5, 7],
    long: [6, 9],
  }[key] || [5, 7];

  // Protein g/kg/day — endurance mid-band; higher on hard days
  const proPerKg = {
    rest: [1.2, 1.4],
    base: [1.3, 1.5],
    easy: [1.4, 1.6],
    moderate: [1.5, 1.7],
    long: [1.6, 1.9],
  }[key] || [1.4, 1.7];

  const choMin = round(choPerKg[0] * kg);
  const choMax = round(choPerKg[1] * kg);
  const proMin = round(proPerKg[0] * kg);
  const proMax = round(proPerKg[1] * kg);

  // Fat ~25–30% of estimated energy (CHO 4 kcal/g + protein 4 + fat 9)
  // Use mid CHO/protein to estimate kcal, then fat grams.
  const midCho = (choMin + choMax) / 2;
  const midPro = (proMin + proMax) / 2;
  const nonFatKcal = midCho * 4 + midPro * 4;
  // Assume fat is 28% of total energy → fatKcal = 0.28/0.72 * nonFat
  const fatKcal = (0.28 / 0.72) * nonFatKcal;
  const fatG = round(fatKcal / 9);
  const fatMin = round(fatG * 0.85);
  const fatMax = round(fatG * 1.15);

  // Iron: RDA + runner bump note (food targets, not auto-supplement)
  const ironMale = 8;
  const ironFemale = 18;
  const ironVegMale = round(ironMale * 1.8);
  const ironVegFemale = round(ironFemale * 1.8);
  // Practical mixed-diet target for active runners (aim food total)
  const ironTargetMixed = 12; // between male RDA and female; coach explains sex split
  const ironTargetRunnerFemale = 18;
  const ironTargetVegRunner = 22;

  const postPro = round(clamp(0.3 * kg, 20, 40));
  const periChoLow = 30;
  const periChoHigh = 60;

  return {
    bodyKg: kg,
    dayKey: key,
    dayLabel: day?.label || key,
    carbsG: { min: choMin, max: choMax, perKg: choPerKg },
    proteinG: { min: proMin, max: proMax, perKg: proPerKg },
    fatG: { min: fatMin, max: fatMax },
    ironMg: {
      maleRda: ironMale,
      femaleRda: ironFemale,
      vegMale: ironVegMale,
      vegFemale: ironVegFemale,
      mixedActiveTarget: ironTargetMixed,
      femaleRunnerTarget: ironTargetRunnerFemale,
      vegRunnerTarget: ironTargetVegRunner,
    },
    periRun: {
      carbsPerHourG: [periChoLow, periChoHigh],
      postProteinG: postPro,
      postCarbsG: round(postPro * 3), // ~3:1 CHO:protein recovery snack
    },
  };
}

/** Concrete food portions with approx macros (common Indian + global plates). */
export const FUEL_SOURCES = {
  carbs: {
    veg: [
      { food: 'Cooked rice / roti', portion: '1 cup rice (~150 g cooked) or 2 medium rotis', carbsG: 45, note: 'Main glycogen fuel' },
      { food: 'Oats', portion: '½ cup dry (40 g) cooked in milk/water', carbsG: 27, note: 'Pre-run or breakfast' },
      { food: 'Banana', portion: '1 medium (~120 g)', carbsG: 27, note: 'Fast carbs 30–60 min pre-run' },
      { food: 'Dates', portion: '3–4 soft dates', carbsG: 24, note: 'Dawn / early-morning fuel' },
      { food: 'Potato / sweet potato', portion: '1 medium boiled (~150 g)', carbsG: 30, note: 'Lunch/dinner carb' },
      { food: 'Idli / dosa / poha', portion: '3 idlis or 1 medium dosa plate', carbsG: 35, note: 'Light pre-run if tolerated' },
    ],
    nonveg: [
      { food: 'Same plant carbs + yogurt rice / egg toast', portion: 'Toast + 1 egg or curd rice bowl', carbsG: 40, note: 'Carbs still come from grains/fruit' },
    ],
  },
  protein: {
    veg: [
      { food: 'Paneer', portion: '100 g', proteinG: 18, note: 'Lunch/dinner' },
      { food: 'Greek yogurt / hung curd', portion: '200 g', proteinG: 17, note: 'Post-run snack' },
      { food: 'Dal (cooked lentils)', portion: '1 cup (~200 g)', proteinG: 14, note: 'Pair with rice/roti' },
      { food: 'Tofu', portion: '100 g', proteinG: 12, note: 'Stir-fry or curry' },
      { food: 'Milk', portion: '300 ml', proteinG: 10, note: 'With oats or bedtime' },
      { food: 'Roasted chana / peanuts', portion: '40 g', proteinG: 10, note: 'Snack between meals' },
      { food: 'Whey / plant protein (optional)', portion: '1 scoop (~25–30 g powder)', proteinG: 20, note: 'Post-run if food is delayed' },
    ],
    nonveg: [
      { food: 'Chicken breast (cooked)', portion: '100 g', proteinG: 31, note: 'Post-run / dinner' },
      { food: 'Eggs', portion: '2 large', proteinG: 12, note: 'Breakfast or recovery' },
      { food: 'Fish (rohu / salmon / tuna)', portion: '100 g cooked', proteinG: 22, note: '2–3×/week if available' },
      { food: 'Egg whites + whole egg', portion: '3 whites + 1 whole', proteinG: 18, note: 'Lean protein mix' },
    ],
  },
  fat: {
    veg: [
      { food: 'Peanut / almond butter', portion: '1 tbsp (16 g)', fatG: 8, note: 'Not right before hard runs' },
      { food: 'Ghee / olive oil', portion: '1 tsp (5 g)', fatG: 5, note: 'Cooking fat' },
      { food: 'Avocado / nuts', portion: '10–12 almonds or ¼ avocado', fatG: 8, note: 'Away from race-pace sessions' },
      { food: 'Seeds (flax / chia)', portion: '1 tbsp', fatG: 4, note: 'Omega-3 plant source' },
    ],
    nonveg: [
      { food: 'Egg yolk', portion: '1 yolk', fatG: 5, note: 'With whites for balance' },
      { food: 'Fatty fish', portion: '100 g', fatG: 8, note: 'Omega-3 + protein' },
    ],
  },
  iron: {
    veg: [
      { food: 'Cooked lentils (dal)', portion: '1 cup', ironMg: 6.6, note: 'Non-heme — add lemon/amla/tomato (vitamin C)' },
      { food: 'Cooked spinach / methi', portion: '1/2–1 cup', ironMg: '3-6', note: 'Pair with citrus; avoid tea with this meal' },
      { food: 'Chickpeas / rajma', portion: '1 cup cooked', ironMg: '4-5', note: 'Lunch bowl + salad' },
      { food: 'Tofu', portion: '1/2 cup', ironMg: 3, note: 'With peppers/tomato' },
      { food: 'Fortified breakfast cereal / oats', portion: '1 serving', ironMg: '4-18', note: 'Check label; add fruit' },
      { food: 'Jaggery + sesame / dried apricot', portion: 'small handful', ironMg: '1-2', note: 'Snack, not sole source' },
    ],
    nonveg: [
      { food: 'Lean beef / mutton', portion: '85–100 g', ironMg: '2.5-3.8', note: 'Heme iron — best absorbed' },
      { food: 'Chicken liver (occasional)', portion: '50–85 g', ironMg: '5-11', note: 'Very high; 1×/week enough for many' },
      { food: 'Chicken / turkey', portion: '100 g', ironMg: '0.8-1.2', note: 'Heme + helps plant iron absorption' },
      { food: 'Fish / sardines', portion: '85–100 g', ironMg: '1-2', note: 'Heme + protein' },
      { food: 'Egg', portion: '1 whole', ironMg: '1-1.7', note: 'Modest iron; still useful' },
    ],
  },
};

function formatRange(min, max, unit = 'g') {
  if (min === max) return `${min} ${unit}`;
  return `${min}–${max} ${unit}`;
}

function listSources(rows, key) {
  return rows.map((r) => `• ${r.food}: ${r.portion} ≈ ${r[key]}${key === 'ironMg' ? ' mg iron' : ` ${key.replace('G', '')}`}${r.note ? ` — ${r.note}` : ''}`).join('\n');
}

/**
 * Build coach sections: daily targets, timing, veg/nonveg sources.
 */
export function buildRunningDietSections({
  bodyKg = DEFAULT_BODY_KG,
  weekKm = 0,
  lastRun = null,
  gapDays = null,
  typicalHour = 6,
  ask = '',
} = {}) {
  const day = classifyRunFuelDay({
    weekKm,
    lastRunKm: lastRun?.distance || 0,
    lastRunMinutes: lastRun?.minutes || 0,
    gapDays,
  });
  const t = buildDailyFuelTargets(bodyKg, day);
  const hour = Number(typicalHour) || 6;
  const wake = Math.max(4, hour - 1);
  const postWindow = `${String(hour).padStart(2, '0')}:00–${String(Math.min(23, hour + 1)).padStart(2, '0')}:30`;

  const askLower = String(ask || '').toLowerCase();
  const mentionsNonveg = askLower.includes('nonveg') || askLower.includes('non-veg') || askLower.includes('non veg')
    || askLower.includes('chicken') || askLower.includes('meat') || askLower.includes('egg');
  const mentionsVegWord = askLower.includes('vegetarian') || askLower.includes('vegan') || /\bveg\b/.test(askLower);
  const mentionsVegOnly = mentionsVegWord && !mentionsNonveg;
  const mentionsNonvegOnly = mentionsNonveg && !mentionsVegWord && !askLower.includes('and non');

  // Default: show both. Narrow only when user clearly asks for one side.
  const showVeg = !mentionsNonvegOnly;
  const showNonveg = !mentionsVegOnly;

  const sections = [];

  sections.push({
    id: 'diet-targets',
    title: `Daily fuel targets · ${t.bodyKg} kg · ${day.label}`,
    body: [
      `Scaled to ~${t.bodyKg} kg body mass (change your weight in the ask, e.g. "diet for 65 kg"). Based on ACSM/ISSN-style endurance ranges — not a medical prescription.`,
      `Carbs (main running fuel): ${formatRange(t.carbsG.min, t.carbsG.max)}/day (${t.carbsG.perKg[0]}-${t.carbsG.perKg[1]} g/kg).`,
      `Protein (repair + keep muscle): ${formatRange(t.proteinG.min, t.proteinG.max)}/day (${t.proteinG.perKg[0]}-${t.proteinG.perKg[1]} g/kg). Spread in 3-5 meals (~every 3-4 h).`,
      `Fat (hormones + calories): ${formatRange(t.fatG.min, t.fatG.max)}/day (~20-35% of energy). Keep fat low in the 2-3 h before hard/long runs.`,
      `Iron (oxygen delivery): men RDA 8 mg/day · women 19-50 y RDA 18 mg/day · vegetarians aim ~1.8x (about ${t.ironMg.vegMale}-${t.ironMg.vegFemale} mg). Runners: prioritize food; if tired + pale + rising HR, get ferritin checked before supplements.`,
      lastRun
        ? `Anchored to your last run: ${Number(lastRun.distance).toFixed(1)} km / ${Math.round(lastRun.minutes || 0)} min · 7d volume ${Number(weekKm).toFixed(1)} km.`
        : `Anchored to your recent volume: 7d ${Number(weekKm).toFixed(1)} km.`,
    ].join('\n\n'),
  });

  sections.push({
    id: 'diet-timing',
    title: `When to eat · around ~${String(hour).padStart(2, '0')}:00 runs`,
    body: [
      `Night before (esp. long/quality): carb-focused dinner — rice/roti + dal/curd or chicken + veg. Aim ~${round(t.carbsG.max * 0.3)}-${round(t.carbsG.max * 0.4)} g carbs in that meal.`,
      hour <= 7
        ? `Wake ~${String(wake).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:00 (45-60 min pre-run): 20-40 g fast carbs — banana, 3-4 dates, or toast. Tiny protein OK (sip milk). Skip heavy fat/fiber.`
        : `2.5-3 h pre-run: normal meal with ${round(t.bodyKg * 1)}-${round(t.bodyKg * 2)} g carbs. Then 45-60 min pre: banana/dates if hungry.`,
      `During run (>60-70 min hard/long): ${t.periRun.carbsPerHourG[0]}-${t.periRun.carbsPerHourG[1]} g carbs/hour (sip every 15-20 min) — dates, gels, diluted juice, or sports drink 6-8%. Under 45-50 min easy: water is usually enough.`,
      `Post-run (${postWindow}, within 0-2 h): ${t.periRun.postProteinG} g protein + ~${t.periRun.postCarbsG} g carbs (about 3:1). Examples: curd + banana + toast; dal-rice; eggs + roti; chicken + rice; whey + fruit.`,
      `Rest of day: hit remaining protein in lunch/dinner/snack. Iron-rich meal mid-day with vitamin C; tea/coffee 60+ min away from iron meals.`,
      `Hydration: 300-500 ml in the hour before; during, sip to thirst (~400-800 ml/h in heat). Add sodium if you salt-crave or sweat heavily.`,
    ].join('\n\n'),
  });

  if (showVeg) {
    sections.push({
      id: 'diet-sources-veg',
      title: 'Food sources · vegetarian',
      body: [
        'Carbs (fuel):',
        listSources(FUEL_SOURCES.carbs.veg, 'carbsG'),
        '',
        'Protein:',
        listSources(FUEL_SOURCES.protein.veg, 'proteinG'),
        '',
        'Fat:',
        listSources(FUEL_SOURCES.fat.veg, 'fatG'),
        '',
        'Iron (non-heme — always pair with vitamin C: lemon, amla, orange, tomato, capsicum):',
        listSources(FUEL_SOURCES.iron.veg, 'ironMg'),
        '',
        `Example easy-run day plate (~${t.bodyKg} kg): oats+milk+banana breakfast; dal-rice+salad lunch; paneer/tofu + roti + veg dinner; curd snack. Adjust portions until daily carbs ≈${formatRange(t.carbsG.min, t.carbsG.max)} and protein ≈${formatRange(t.proteinG.min, t.proteinG.max)}.`,
      ].join('\n'),
    });
  }

  if (showNonveg) {
    sections.push({
      id: 'diet-sources-nonveg',
      title: 'Food sources · non-vegetarian',
      body: [
        'Protein + heme iron (best absorbed):',
        listSources(FUEL_SOURCES.protein.nonveg, 'proteinG'),
        '',
        listSources(FUEL_SOURCES.iron.nonveg, 'ironMg'),
        '',
        'Fat extras:',
        listSources(FUEL_SOURCES.fat.nonveg, 'fatG'),
        '',
        'Still eat the same carb bases (rice, roti, oats, fruit) — meat does not replace glycogen fuel.',
        '',
        `Example hard/long day: toast+egg pre; during: 30–60 g carbs/h; post: chicken rice or eggs+roti+fruit; dinner fish/chicken + carbs + greens. Daily targets still ${formatRange(t.carbsG.min, t.carbsG.max)} carbs · ${formatRange(t.proteinG.min, t.proteinG.max)} protein.`,
      ].join('\n'),
    });
  }

  sections.push({
    id: 'diet-workout-link',
    title: 'How this matches your workout',
    body: [
      day.key === 'long'
        ? 'Long / high volume: bias carbs up (upper end of range). Practice race fueling on long runs. Post-run protein is non-negotiable.'
        : day.key === 'moderate'
          ? 'Moderate day: mid-range carbs. Keep one iron-rich meal. Don’t skip post-run protein even if appetite is low — liquid yogurt/shake is fine.'
          : 'Easy / rest: carbs toward lower end; keep protein steady so recovery continues. Use rest day for iron-rich + vitamin C meal without rushing.',
      'Rule of thumb: harder or longer → more carbs that day; protein stays high every day; fat fills calories but not right before speed work.',
      'Safety: this is sports-nutrition guidance for healthy adults. Pregnancy, anemia, kidney disease, or diagnosed deficiencies need a clinician/dietitian — Cosmix does not replace blood tests or prescriptions.',
    ].join('\n\n'),
  });

  return {
    day,
    targets: t,
    sections,
    headline: `Running fuel & diet · ${day.label} · ${t.bodyKg} kg`,
  };
}

/** Parse body weight from free-text ask, e.g. "65 kg", "70kg", "for 62 kilos". */
export function parseBodyKgFromAsk(ask = '', fallback = DEFAULT_BODY_KG) {
  const text = String(ask || '');
  const m = text.match(/(\d{2,3})\s*(?:kg|kgs|kilo|kilos)\b/i)
    || text.match(/\b(?:weight|wt|body)\s*[:=]?\s*(\d{2,3})\b/i);
  if (!m) return fallback;
  return clamp(Number(m[1]), 40, 140);
}

export function isDietAsk(ask = '') {
  const a = String(ask || '').toLowerCase();
  return (
    a.includes('diet')
    || a.includes('protein')
    || a.includes('carb')
    || a.includes('iron')
    || a.includes('calorie')
    || a.includes('nutrition')
    || a.includes('meal')
    || a.includes('what should i eat')
    || a.includes('what to eat')
    || a.includes('food source')
    || a.includes('veg')
    || a.includes('nonveg')
    || a.includes('non-veg')
    || (a.includes('fuel') && (a.includes('gram') || a.includes('macro') || a.includes('eat')))
  );
}
