export type WellnessMetricRule = {
  key: string;
  label: string;
  icon: string;
  unit: string;
  physicalMultiplier: number;
  physicalDivisor: number;
  mentalMultiplier: number;
  mentalDivisor: number;
};

export type WellnessScoringRules = {
  activities: WellnessMetricRule[];
  dailyPenalty: {
    physical: number;
    mental: number;
  };
  sleep: {
    baselineHours: number;
    stepHours: number;
    scorePerStep: number;
    defaultHours: number;
  };
  targets: {
    hamptaPass: number;
    skiing2027: number;
    marathon10k: number;
  };
};

export const DEFAULT_SCORING_RULES: WellnessScoringRules = {
  activities: [
    { key: 'runningDistanceKm', label: 'Running', icon: '🏃', unit: 'km', physicalMultiplier: 0.9, physicalDivisor: 1, mentalMultiplier: 0.4, mentalDivisor: 1 },
    { key: 'runningMinutes', label: 'Running time', icon: '🏃', unit: 'mins', physicalMultiplier: 0.5, physicalDivisor: 30, mentalMultiplier: 0.2, mentalDivisor: 30 },
    { key: 'cyclingDistanceKm', label: 'Cycling', icon: '🚴', unit: 'km', physicalMultiplier: 0.8, physicalDivisor: 1, mentalMultiplier: 0.3, mentalDivisor: 1 },
    { key: 'walkingDistanceKm', label: 'Walking distance', icon: '🚶', unit: 'km', physicalMultiplier: 0.35, physicalDivisor: 1, mentalMultiplier: 0.15, mentalDivisor: 1 },
    { key: 'walkingMinutes', label: 'Walking time', icon: '🚶', unit: 'mins', physicalMultiplier: 0.4, physicalDivisor: 30, mentalMultiplier: 0.25, mentalDivisor: 30 },
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

export function roundScore(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

function upgradeLegacyWalkingYogaRules(activities: WellnessMetricRule[] = []) {
  return activities.map((rule) => {
    if (rule.key === 'walkingMinutes' && Number(rule.physicalMultiplier) === 0) {
      return { ...rule, physicalMultiplier: 0.4, physicalDivisor: 30, mentalMultiplier: Math.max(Number(rule.mentalMultiplier) || 0, 0.25), mentalDivisor: 30 };
    }
    if (rule.key === 'walkingDistanceKm' && Number(rule.mentalMultiplier) === 0) {
      return { ...rule, physicalMultiplier: Math.max(Number(rule.physicalMultiplier) || 0, 0.35), mentalMultiplier: 0.15 };
    }
    return rule;
  });
}

export function normalizeScoringRules(input?: Partial<WellnessScoringRules> | null): WellnessScoringRules {
  const activityMap = new Map(
    (input?.activities || []).map((rule) => [String(rule.key || ''), rule]),
  );

  const defaultActivityKeys = new Set(DEFAULT_SCORING_RULES.activities.map((rule) => rule.key));

  const normalizeRule = (baseRule: Partial<WellnessMetricRule>, override?: Partial<WellnessMetricRule>) => ({
    key: String(override?.key || baseRule.key || ''),
    label: String(override?.label || baseRule.label || 'Custom activity'),
    icon: String(override?.icon || baseRule.icon || '✨'),
    unit: String(override?.unit || baseRule.unit || 'mins'),
    physicalMultiplier: Number(override?.physicalMultiplier ?? baseRule.physicalMultiplier ?? 0),
    physicalDivisor: Math.max(1, Number(override?.physicalDivisor ?? baseRule.physicalDivisor ?? 1)),
    mentalMultiplier: Number(override?.mentalMultiplier ?? baseRule.mentalMultiplier ?? 0),
    mentalDivisor: Math.max(1, Number(override?.mentalDivisor ?? baseRule.mentalDivisor ?? 1)),
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

  const activities = upgradeLegacyWalkingYogaRules([...defaultRules, ...customRules]);

  return {
    activities,
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

function sleepScore(sleepHours: unknown, rules: WellnessScoringRules) {
  const explicitHours = Number(sleepHours || 0);
  const hours = explicitHours > 0 ? explicitHours : Number(rules.sleep.defaultHours || 0);
  if (hours === 0) return 0;
  const diff = hours - rules.sleep.baselineHours;
  return (diff / rules.sleep.stepHours) * rules.sleep.scorePerStep;
}

function computeContribution(value: unknown, multiplier: number, divisor: number) {
  if (!multiplier) return 0;
  return (Number(value || 0) / Math.max(1, divisor)) * multiplier;
}

export function hydrateSportMinutesFromStrava(entry: Record<string, unknown> = {}) {
  const next: Record<string, unknown> = { ...entry };
  const walks = Array.isArray(entry.stravaWalks) ? entry.stravaWalks as any[] : [];
  if (walks.length) {
    const mins = walks.reduce((sum, walk) => sum + Number(walk?.minutes || 0), 0);
    const km = walks.reduce((sum, walk) => sum + Number(walk?.distanceKm || 0), 0);
    if (mins > Number(next.walkingMinutes || 0)) next.walkingMinutes = Math.round(mins);
    if (km > Number(next.walkingDistanceKm || 0)) next.walkingDistanceKm = Number(km.toFixed(2));
  }
  const yoga = Array.isArray(entry.stravaYoga) ? entry.stravaYoga as any[] : [];
  if (yoga.length) {
    const mins = yoga.reduce((sum, session) => sum + Number(session?.minutes || 0), 0);
    if (mins > Number(next.yogaMinutes || 0)) next.yogaMinutes = Math.round(mins);
  }
  return next;
}

export function getWorkoutMinutes(entry: Record<string, unknown>) {
  const hydrated = hydrateSportMinutesFromStrava(entry);
  return Number(hydrated.runningMinutes || 0)
    + Number(hydrated.cyclingMinutes || 0)
    + Number(hydrated.walkingMinutes || 0)
    + Number(hydrated.exerciseMinutes || 0)
    + Number(hydrated.yogaMinutes || 0)
    + Number(hydrated.badmintonMinutes || 0)
    + Number(hydrated.footballMinutes || 0)
    + Number(hydrated.cricketMinutes || 0)
    + Number(hydrated.swimmingMinutes || 0);
}

export function computeEntryScores(entry: Record<string, unknown>, rules: WellnessScoringRules = DEFAULT_SCORING_RULES) {
  const normalizedRules = normalizeScoringRules(rules);
  const hydrated = hydrateSportMinutesFromStrava(entry);
  const physicalBase = normalizedRules.activities.reduce(
    (sum, rule) => sum + computeContribution(hydrated[rule.key], rule.physicalMultiplier, rule.physicalDivisor),
    0,
  );
  const mentalBase = normalizedRules.activities.reduce(
    (sum, rule) => sum + computeContribution(hydrated[rule.key], rule.mentalMultiplier, rule.mentalDivisor),
    0,
  );
  const sleepPhysical = sleepScore(entry.sleepHours, normalizedRules);
  const sleepMental = sleepScore(entry.sleepHours, normalizedRules);
  const physicalScore = roundScore(physicalBase + sleepPhysical - normalizedRules.dailyPenalty.physical);
  const mentalScore = roundScore(mentalBase + sleepMental - normalizedRules.dailyPenalty.mental);

  return {
    physicalScore,
    mentalScore,
    totalScore: roundScore(physicalScore + mentalScore),
    physicalPenalty: roundScore(normalizedRules.dailyPenalty.physical),
    mentalPenalty: roundScore(normalizedRules.dailyPenalty.mental),
    sleepPhysical: roundScore(sleepPhysical),
    sleepMental: roundScore(sleepMental),
    workoutMinutes: getWorkoutMinutes(entry),
  };
}