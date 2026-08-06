/**
 * Next-session coaching tip from race goal + recent run history.
 */
export function buildTrainingTip({ runRows = [], goalDistanceKm = 21.0975, longRunTargetKm = null, readiness = null } = {}) {
  const distanceGoal = Math.max(1, Number(goalDistanceKm) || 21.0975);
  const targetLong = Number(longRunTargetKm) || Number((distanceGoal * 0.82).toFixed(1));
  const runs = (Array.isArray(runRows) ? runRows : [])
    .filter((r) => Number(r.distance || 0) > 0 && Number(r.minutes || 0) > 0)
    .map((r) => ({
      date: String(r.date || '').slice(0, 10),
      distance: Number(r.distance),
      minutes: Number(r.minutes),
      pace: Number(r.minutes) / Number(r.distance),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!runs.length) {
    return {
      title: 'Start building',
      tip: `Log your first easy run (~4–6 km). Aim toward a long run of ~${targetLong} km for your ${distanceGoal.toFixed(1)} km race.`,
      action: 'Easy 5 km',
    };
  }

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const weekKm = runs.filter((r) => r.date >= daysAgo(7)).reduce((s, r) => s + r.distance, 0);
  const recentPeak = Math.max(...runs.filter((r) => r.date >= daysAgo(56)).map((r) => r.distance), runs[0].distance);
  const last = runs[0];
  const last3 = runs.slice(0, 3);
  const avgPace3 = last3.reduce((s, r) => s + r.pace, 0) / last3.length;
  const daysSinceLast = Math.max(0, Math.round((today - new Date(`${last.date}T12:00:00`)) / 86400000));
  const nextLong = Math.min(targetLong, Number((recentPeak + Math.max(1.5, recentPeak * 0.1)).toFixed(1)));
  const ratio = recentPeak / distanceGoal;

  if (daysSinceLast >= 3) {
    return {
      title: 'Get back on schedule',
      tip: `Last run was ${daysSinceLast}d ago (${last.distance.toFixed(1)} km). Do an easy ${Math.max(5, Math.min(8, recentPeak * 0.6)).toFixed(0)} km shakeout before pushing longer.`,
      action: `Easy ${Math.max(5, Math.min(8, recentPeak * 0.6)).toFixed(0)} km`,
    };
  }

  if (ratio < 0.55) {
    return {
      title: 'Build the long run',
      tip: `Peak long run is ${recentPeak.toFixed(1)} km (${Math.round(ratio * 100)}% of race). This weekend aim for ~${nextLong} km easy (target ~${targetLong} km before race).`,
      action: `Long run ${nextLong} km`,
    };
  }

  if (weekKm < (distanceGoal >= 40 ? 40 : distanceGoal >= 20 ? 28 : 18) * 0.7) {
    const weekTarget = distanceGoal >= 40 ? 40 : distanceGoal >= 20 ? 28 : 18;
    return {
      title: 'Add volume',
      tip: `This week you’re at ${weekKm.toFixed(1)} km. Add a mid-week ${Math.max(6, Math.round((weekTarget - weekKm) / 2))} km aerobic run to climb toward ~${weekTarget} km.`,
      action: `+${Math.max(6, Math.round((weekTarget - weekKm) / 2))} km mid-week`,
    };
  }

  if (avgPace3 > 8.5 && recentPeak >= 8) {
    return {
      title: 'Inject some speed',
      tip: `Long runs are progressing (${recentPeak.toFixed(1)} km) but recent pace is ~${Math.floor(avgPace3)}:${String(Math.round((avgPace3 % 1) * 60)).padStart(2, '0')}/km. Do 6–8 × 400m or a 20–30 min tempo after an easy warm-up.`,
      action: 'Tempo / intervals',
    };
  }

  if (ratio < 0.75) {
    return {
      title: 'Stretch the long run',
      tip: `You’re at ${recentPeak.toFixed(1)} km peak. Next long run: ${nextLong} km easy, finish feeling controlled. Race goal still needs ~${targetLong} km.`,
      action: `Long run ${nextLong} km`,
    };
  }

  const readinessNote = readiness?.readinessPercent != null
    ? ` Readiness ~${readiness.readinessPercent}%.`
    : '';
  return {
    title: 'Race sharpening',
    tip: `Long-run base looks solid (${recentPeak.toFixed(1)} km). Keep weekly volume, one quality session, and long run near ${Math.min(targetLong, recentPeak + 1).toFixed(1)} km.${readinessNote}`,
    action: 'Maintain + quality',
  };
}
