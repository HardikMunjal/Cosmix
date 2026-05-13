export const DEFAULT_SCORING_RULES = {
  activities: [
    { key: 'runningDistanceKm', label: 'Running', icon: '🏃', unit: 'km', physicalMultiplier: 0.9, physicalDivisor: 1, mentalMultiplier: 0.4, mentalDivisor: 1 },
    { key: 'cyclingMinutes', label: 'Cycling', icon: '🚴', unit: 'mins', physicalMultiplier: 0.8, physicalDivisor: 30, mentalMultiplier: 0.3, mentalDivisor: 30 },
    { key: 'walkingDistanceKm', label: 'Walking distance', icon: '🚶', unit: 'km', physicalMultiplier: 0.3, physicalDivisor: 1, mentalMultiplier: 0, mentalDivisor: 1 },
    { key: 'walkingMinutes', label: 'Walking time', icon: '🚶', unit: 'mins', physicalMultiplier: 0, physicalDivisor: 1, mentalMultiplier: 0.25, mentalDivisor: 30 },
    { key: 'exerciseMinutes', label: 'Workout', icon: '💪', unit: 'mins', physicalMultiplier: 0.8, physicalDivisor: 30, mentalMultiplier: 0.5, mentalDivisor: 30 },
    { key: 'yogaMinutes', label: 'Yoga', icon: '🧘', unit: 'mins', physicalMultiplier: 0.8, physicalDivisor: 30, mentalMultiplier: 0.5, mentalDivisor: 30 },
    { key: 'badmintonMinutes', label: 'Badminton', icon: '🏸', unit: 'mins', physicalMultiplier: 1.2, physicalDivisor: 60, mentalMultiplier: 0.5, mentalDivisor: 30 },
    { key: 'footballMinutes', label: 'Football', icon: '⚽', unit: 'mins', physicalMultiplier: 2, physicalDivisor: 60, mentalMultiplier: 0.5, mentalDivisor: 30 },
    { key: 'cricketMinutes', label: 'Cricket', icon: '🏏', unit: 'mins', physicalMultiplier: 1.5, physicalDivisor: 60, mentalMultiplier: 0.5, mentalDivisor: 30 },
    { key: 'swimmingMinutes', label: 'Swimming', icon: '🏊', unit: 'mins', physicalMultiplier: 0.7, physicalDivisor: 30, mentalMultiplier: 1, mentalDivisor: 30 },
    { key: 'meditationMinutes', label: 'Meditation', icon: '🧘', unit: 'mins', physicalMultiplier: 0.2, physicalDivisor: 30, mentalMultiplier: 1.5, mentalDivisor: 30 },
    { key: 'whiskyPegs', label: 'Whisky', icon: '🥃', unit: 'pegs', physicalMultiplier: -1.1, physicalDivisor: 1, mentalMultiplier: 0, mentalDivisor: 1 },
    { key: 'fastFoodServings', label: 'Fast food', icon: '🍔', unit: 'count', physicalMultiplier: -0.9, physicalDivisor: 1, mentalMultiplier: 0, mentalDivisor: 1 },
    { key: 'sugarServings', label: 'Sugar', icon: '🍬', unit: 'count', physicalMultiplier: -2, physicalDivisor: 1, mentalMultiplier: 0, mentalDivisor: 1 },
  ],
  dailyPenalty: {
    physical: 2.7,
    mental: 1,
  },
  sleep: {
    baselineHours: 6.5,
    stepHours: 0.5,
    scorePerStep: 0.5,
    defaultHours: 7,
  },
  targets: {
    hamptaPass: 90,
    skiing2027: 300,
    marathon10k: 100,
  },
};

export const DAILY_PENALTY = DEFAULT_SCORING_RULES.dailyPenalty;

export function normalizeScoringRules(input) {
  const activityMap = new Map((input?.activities || []).map((rule) => [String(rule.key || ''), rule]));
  const defaultActivityKeys = new Set(DEFAULT_SCORING_RULES.activities.map((rule) => rule.key));

  const normalizeRule = (baseRule, override = {}) => ({
    key: String(override?.key || baseRule?.key || ''),
    label: String(override?.label || baseRule?.label || 'Custom activity'),
    icon: String(override?.icon || baseRule?.icon || '✨'),
    unit: String(override?.unit || baseRule?.unit || 'mins'),
    physicalMultiplier: Number(override?.physicalMultiplier ?? baseRule?.physicalMultiplier ?? 0),
    physicalDivisor: Math.max(1, Number(override?.physicalDivisor ?? baseRule?.physicalDivisor ?? 1)),
    mentalMultiplier: Number(override?.mentalMultiplier ?? baseRule?.mentalMultiplier ?? 0),
    mentalDivisor: Math.max(1, Number(override?.mentalDivisor ?? baseRule?.mentalDivisor ?? 1)),
  });

  const defaultRules = DEFAULT_SCORING_RULES.activities.map((defaultRule) => {
    const override = activityMap.get(defaultRule.key);
    return normalizeRule(defaultRule, override);
  });

  const customRules = (input?.activities || [])
    .filter((rule) => {
      const key = String(rule?.key || '');
      return Boolean(key) && !defaultActivityKeys.has(key);
    })
    .map((rule) => normalizeRule(rule, rule));

  return {
    activities: [...defaultRules, ...customRules],
    dailyPenalty: {
      physical: Number(input?.dailyPenalty?.physical ?? DEFAULT_SCORING_RULES.dailyPenalty.physical),
      mental: Number(input?.dailyPenalty?.mental ?? DEFAULT_SCORING_RULES.dailyPenalty.mental),
    },
    sleep: {
      baselineHours: Number(input?.sleep?.baselineHours ?? DEFAULT_SCORING_RULES.sleep.baselineHours),
      stepHours: Math.max(0.1, Number(input?.sleep?.stepHours ?? DEFAULT_SCORING_RULES.sleep.stepHours)),
      scorePerStep: Number(input?.sleep?.scorePerStep ?? DEFAULT_SCORING_RULES.sleep.scorePerStep),
      defaultHours: Number(input?.sleep?.defaultHours ?? DEFAULT_SCORING_RULES.sleep.defaultHours),
    },
    targets: {
      hamptaPass: Number(input?.targets?.hamptaPass ?? DEFAULT_SCORING_RULES.targets.hamptaPass),
      skiing2027: Number(input?.targets?.skiing2027 ?? DEFAULT_SCORING_RULES.targets.skiing2027),
      marathon10k: Number(input?.targets?.marathon10k ?? DEFAULT_SCORING_RULES.targets.marathon10k),
    },
  };
}

export function roundScore(value) {
  return Number(Number(value || 0).toFixed(2));
}

function sleepScore(sleepHours, rules) {
  const explicitHours = Number(sleepHours || 0);
  const hrs = explicitHours > 0 ? explicitHours : Number(rules.sleep.defaultHours || 0);
  if (hrs === 0) return 0;
  const diff = hrs - rules.sleep.baselineHours;
  return (diff / rules.sleep.stepHours) * rules.sleep.scorePerStep;
}

function computeContribution(value, multiplier, divisor) {
  if (!multiplier) return 0;
  return (Number(value || 0) / Math.max(1, divisor)) * multiplier;
}

export function getWorkoutMinutes(entry) {
  return Number(entry.runningMinutes || 0)
    + Number(entry.cyclingMinutes || 0)
    + Number(entry.walkingMinutes || 0)
    + Number(entry.exerciseMinutes || 0)
    + Number(entry.yogaMinutes || 0)
    + Number(entry.badmintonMinutes || 0)
    + Number(entry.footballMinutes || 0)
    + Number(entry.cricketMinutes || 0)
    + Number(entry.swimmingMinutes || 0);
}

export function computeEntryScores(entry, scoringRules = DEFAULT_SCORING_RULES) {
  const rules = normalizeScoringRules(scoringRules);
  const physicalBase = rules.activities.reduce((sum, rule) => sum + computeContribution(entry[rule.key], rule.physicalMultiplier, rule.physicalDivisor), 0);
  const mentalBase = rules.activities.reduce((sum, rule) => sum + computeContribution(entry[rule.key], rule.mentalMultiplier, rule.mentalDivisor), 0);

  const sleepPhysical = sleepScore(entry.sleepHours, rules);
  const sleepMental = sleepScore(entry.sleepHours, rules);
  const physicalPenalty = rules.dailyPenalty.physical;
  const mentalPenalty = rules.dailyPenalty.mental;

  const physicalScore = roundScore(physicalBase + sleepPhysical - physicalPenalty);
  const mentalScore = roundScore(mentalBase + sleepMental - mentalPenalty);

  return {
    physicalScore,
    mentalScore,
    totalScore: roundScore(physicalScore + mentalScore),
    physicalPenalty: roundScore(physicalPenalty),
    mentalPenalty: roundScore(mentalPenalty),
    sleepPhysical: roundScore(sleepPhysical),
    sleepMental: roundScore(sleepMental),
    workoutMinutes: getWorkoutMinutes(entry),
  };
}

export function computeDashboardStats(entries, currentEntry, scoringRules = DEFAULT_SCORING_RULES) {
  const rules = normalizeScoringRules(scoringRules);
  const rows = [currentEntry, ...entries.filter((entry) => entry.date !== currentEntry.date)].slice(0, 14);
  const weekRows = rows.slice(0, 7);

  const weeklyRunningKm = weekRows.reduce((sum, entry) => sum + Number(entry.runningDistanceKm || 0), 0);
  const weeklyWorkoutMinutes = weekRows.reduce((sum, entry) => sum + getWorkoutMinutes(entry), 0);
  const totalRunningMinutes = weekRows.reduce((sum, entry) => sum + Number(entry.runningMinutes || 0), 0);
  const averagePace = weeklyRunningKm > 0 ? totalRunningMinutes / weeklyRunningKm : null;
  const activeDays = weekRows.filter((entry) => getWorkoutMinutes(entry) > 0).length;
  const scoredRows = rows.map((entry) => ({ entry, scores: computeEntryScores(entry, rules) }));
  const totalPhysicalScore = scoredRows.reduce((sum, row) => sum + row.scores.physicalScore, 0);
  const totalMentalScore = scoredRows.reduce((sum, row) => sum + row.scores.mentalScore, 0);
  const totalBodyScore = roundScore(totalPhysicalScore + totalMentalScore);

  return {
    todayScores: computeEntryScores(currentEntry, rules),
    weeklyRunningKm: roundScore(weeklyRunningKm),
    weeklyWorkoutMinutes: roundScore(weeklyWorkoutMinutes),
    averagePace: averagePace == null ? null : roundScore(averagePace),
    activeDays,
    totalPhysicalScore: roundScore(totalPhysicalScore),
    totalMentalScore: roundScore(totalMentalScore),
    totalBodyScore,
    readiness: {
      hamptaPass: buildReadiness(totalBodyScore, rules.targets.hamptaPass),
      skiing2027: buildReadiness(totalBodyScore, rules.targets.skiing2027),
      marathon10k: buildReadiness(totalBodyScore, rules.targets.marathon10k),
    },
  };
}

function buildReadiness(currentScore, targetScore) {
  return {
    targetScore,
    currentScore: roundScore(currentScore),
    percent: Math.max(0, Math.min(100, roundScore((currentScore / targetScore) * 100))),
    remaining: roundScore(Math.max(0, targetScore - currentScore)),
  };
}