/** Minute-based activity fields aggregated for buddy/leaderboard comparisons. */
export const ACTIVITY_METRIC_DEFS = [
  { key: 'badmintonMinutes', label: 'Badminton' },
  { key: 'runningMinutes', label: 'Running' },
  { key: 'cyclingMinutes', label: 'Cycling' },
  { key: 'swimmingMinutes', label: 'Swimming' },
  { key: 'yogaMinutes', label: 'Yoga' },
  { key: 'walkingMinutes', label: 'Walking' },
  { key: 'exerciseMinutes', label: 'Workout' },
  { key: 'footballMinutes', label: 'Football' },
  { key: 'cricketMinutes', label: 'Cricket' },
  { key: 'meditationMinutes', label: 'Meditation' },
];

export function aggregateActivityTotals(entries = []) {
  const totals = Object.fromEntries(ACTIVITY_METRIC_DEFS.map((metric) => [metric.key, 0]));
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const metric of ACTIVITY_METRIC_DEFS) {
      const value = Number(entry?.[metric.key] || 0);
      if (Number.isFinite(value) && value > 0) {
        totals[metric.key] += value;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Number(value.toFixed(1))]),
  );
}
