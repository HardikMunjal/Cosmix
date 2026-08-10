/**
 * Coaching tip from race goal + recent run history (HR, speed, long runs, recovery).
 * Body readiness = how ready you are to train hard today (rest raises it).
 */
function toDay(value) {
  return String(value || '').slice(0, 10);
}

function daysBetween(a, b) {
  const ms = new Date(`${toDay(b)}T12:00:00`).getTime() - new Date(`${toDay(a)}T12:00:00`).getTime();
  return Math.round(ms / 86400000);
}

function fmtPace(minPerKm) {
  if (!minPerKm || !isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function hourOfRun(row) {
  const raw = String(row.startTime || row.date || '');
  const match = raw.match(/T(\d{2})/);
  if (match) return Number(match[1]);
  return 7;
}

function normalizeRuns(runRows = []) {
  return (Array.isArray(runRows) ? runRows : [])
    .filter((r) => Number(r.distance || 0) > 0 && Number(r.minutes || 0) > 0)
    .map((r) => ({
      date: toDay(r.date),
      distance: Number(r.distance),
      minutes: Number(r.minutes),
      pace: Number(r.minutes) / Number(r.distance),
      speed: Number(r.distance) / (Number(r.minutes) / 60),
      avgHeartrate: Number(r.avgHeartrate || r.avgHeartRate || 0) || null,
      maxHeartrate: Number(r.maxHeartrate || r.maxHeartRate || 0) || null,
      startTime: r.startTime || r.date,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/**
 * How ready your body is to train today (0–100).
 * Rest after load increases readiness; very long gaps slowly lower it.
 */
export function buildBodyReadiness({ runRows = [] } = {}) {
  const runs = normalizeRuns(runRows);
  const today = toDay(new Date().toISOString());
  if (!runs.length) {
    return {
      percent: 70,
      label: 'Fresh start',
      color: '#38bdf8',
      why: 'No recent load — body is available; start easy to wake systems up.',
      daysSinceLast: null,
    };
  }

  const last = runs[0];
  const last3 = runs.slice(0, 3);
  const last7 = runs.filter((r) => daysBetween(r.date, today) <= 6);
  const weekKm = last7.reduce((s, r) => s + r.distance, 0);
  const avgPace3 = last3.reduce((s, r) => s + r.pace, 0) / last3.length;
  const hrRuns = last7.filter((r) => r.avgHeartrate);
  const avgHr7 = hrRuns.length ? hrRuns.reduce((s, r) => s + r.avgHeartrate, 0) / hrRuns.length : null;
  const daysSinceLast = Math.max(0, daysBetween(last.date, today));
  const hardLoad = (avgHr7 && avgHr7 >= 155) || last.pace <= avgPace3 * 0.92 || last.distance >= 14;
  const veryHard = last.distance >= 18 || (last.avgHeartrate && last.avgHeartrate >= 165);

  let percent;
  if (daysSinceLast === 0) {
    percent = veryHard ? 42 : hardLoad ? 52 : 64;
  } else if (daysSinceLast === 1) {
    percent = veryHard ? 68 : hardLoad ? 78 : 86;
  } else if (daysSinceLast === 2) {
    percent = veryHard ? 82 : hardLoad ? 90 : 92;
  } else if (daysSinceLast === 3) {
    percent = 88;
  } else if (daysSinceLast === 4) {
    percent = 84;
  } else if (daysSinceLast === 5) {
    percent = 80;
  } else if (daysSinceLast <= 7) {
    percent = 74;
  } else {
    percent = Math.max(58, 72 - (daysSinceLast - 7) * 2);
  }

  if (weekKm >= 55 && daysSinceLast <= 1) percent -= 6;
  else if (weekKm >= 40 && daysSinceLast === 0) percent -= 4;
  if (weekKm > 0 && weekKm < 25 && daysSinceLast >= 1) percent += 3;
  if (last.distance >= 10 && daysSinceLast >= 1 && daysSinceLast <= 3) percent += 2;

  percent = Math.max(28, Math.min(98, Math.round(percent)));

  let label = 'Building';
  let color = '#f59e0b';
  if (percent >= 88) {
    label = 'Prime';
    color = '#22c55e';
  } else if (percent >= 78) {
    label = 'Ready';
    color = '#34d399';
  } else if (percent >= 65) {
    label = 'Good';
    color = '#38bdf8';
  } else if (percent >= 50) {
    label = 'Recovering';
    color = '#fbbf24';
  } else {
    label = 'Rest first';
    color = '#fb7185';
  }

  const why = daysSinceLast === 0
    ? (hardLoad
      ? `You trained today (${last.distance.toFixed(1)} km) — readiness is lower until recovery lands.`
      : `Easy session today — readiness is okay; another hard effort can wait.`)
    : daysSinceLast === 1
      ? `One rest day after ${last.distance.toFixed(1)} km — body power is rising.`
      : daysSinceLast === 2
        ? `Two days of recovery after ${last.distance.toFixed(1)} km — high readiness / more power available.`
        : daysSinceLast <= 4
          ? `${daysSinceLast} days since last run — you should feel strong; keep the next session quality or aerobic.`
          : `${daysSinceLast} days without a run — still capable, but a short reboot jog will sharpen readiness.`;

  return {
    percent,
    label,
    color,
    why,
    daysSinceLast,
    weekKm: Number(weekKm.toFixed(1)),
    hardLoad,
  };
}

export function buildTrainingTip({
  runRows = [],
  goalDistanceKm = 21.0975,
  longRunTargetKm = null,
  readiness = null,
} = {}) {
  const distanceGoal = Math.max(1, Number(goalDistanceKm) || 21.0975);
  const targetLong = Number(longRunTargetKm) || Number((distanceGoal * 0.82).toFixed(1));
  const runs = normalizeRuns(runRows);
  const body = buildBodyReadiness({ runRows });
  const today = toDay(new Date().toISOString());

  if (!runs.length) {
    return {
      title: 'Boot sequence',
      tip: `No recent runs logged. Start with an easy 4–6 km aerobic jog and build toward a ~${targetLong} km long run for your ${distanceGoal.toFixed(1)} km goal.`,
      action: 'Easy 5 km',
      nextWhen: 'Tomorrow morning',
      fuel: 'Banana + small oats bowl 60–90 min before. Skip heavy fried food.',
      hydration: '300–400 ml water 30 min pre-run. Carry 150–250 ml if >40 min.',
      sleep: '7.5–8.5 hours tonight for a clean first session.',
      confidence: body.percent / 100,
      bodyReadiness: body,
    };
  }

  const last = runs[0];
  const last3 = runs.slice(0, 3);
  const last7 = runs.filter((r) => daysBetween(r.date, today) <= 6);
  const last30 = runs.filter((r) => daysBetween(r.date, today) <= 29);
  const weekKm = last7.reduce((s, r) => s + r.distance, 0);
  const recentPeak = Math.max(...runs.filter((r) => daysBetween(r.date, today) <= 56).map((r) => r.distance), last.distance);
  const avgPace3 = last3.reduce((s, r) => s + r.pace, 0) / last3.length;
  const avgSpeed3 = last3.reduce((s, r) => s + r.speed, 0) / last3.length;
  const hrRuns = last7.filter((r) => r.avgHeartrate);
  const avgHr7 = hrRuns.length ? hrRuns.reduce((s, r) => s + r.avgHeartrate, 0) / hrRuns.length : null;
  const daysSinceLast = Math.max(0, daysBetween(last.date, today));
  const nextLong = Math.min(targetLong, Number((recentPeak + Math.max(1.5, recentPeak * 0.1)).toFixed(1)));
  const ratio = recentPeak / distanceGoal;
  const morningBias = runs.slice(0, 8).filter((r) => hourOfRun(r) < 11).length >= Math.ceil(Math.min(8, runs.length) / 2);
  const hardLoad = (avgHr7 && avgHr7 >= 155) || last.pace <= avgPace3 * 0.92;
  const recoveryHours = hardLoad
    ? Math.max(36, Math.min(60, 24 + last.distance * 1.8))
    : Math.max(24, Math.min(48, 18 + last.distance * 1.2));
  const sleepHours = hardLoad || last.distance >= 15 ? 8.5 : last.distance >= 10 ? 8 : 7.5;
  const nextWhen = daysSinceLast === 0
    ? (hardLoad ? `Rest today · next run in ~${Math.round(recoveryHours)}h` : 'Optional easy shakeout this evening, or rest')
    : daysSinceLast === 1
      ? (hardLoad ? 'Tomorrow easy aerobic' : (morningBias ? 'Tomorrow morning window' : 'Later today / tomorrow'))
      : (morningBias ? 'Tomorrow morning' : 'Within 24 hours');

  const fuel = morningBias
    ? (last.distance >= 12
      ? 'Light toast + peanut butter or banana 60–90 min before. Skip large dairy.'
      : 'Banana or 2 dates + black coffee/tea 45–60 min before.')
    : 'Small carb snack 60 min pre-run (toast/fruit). Avoid heavy lunch within 2.5h.';

  const hydration = last.distance >= 12 || avgSpeed3 >= 10
    ? 'Pre: 400 ml water. During: 150–200 ml every 15–20 min. Hot day → add electrolytes / 200–300 ml sports drink.'
    : 'Pre: 300 ml water. For <50 min, sip only if thirsty. Skip sugary energy drinks on easy days.';

  const sleep = `Target ${sleepHours}h sleep before the next key session for full recovery after your ${last.distance.toFixed(1)} km effort.`;

  let title = 'Race sharpening';
  let tip = '';
  let action = 'Maintain + quality';

  if (daysSinceLast >= 3) {
    title = 'Reboot after gap';
    tip = `Last run was ${daysSinceLast}d ago (${last.distance.toFixed(1)} km`
      + (last.avgHeartrate ? `, avg HR ${Math.round(last.avgHeartrate)}` : '')
      + `). Priority: easy ${Math.max(5, Math.min(8, recentPeak * 0.55)).toFixed(0)} km aerobic — keep HR conversational, not tempo.`;
    action = `Easy ${Math.max(5, Math.min(8, recentPeak * 0.55)).toFixed(0)} km`;
  } else if (avgHr7 && avgHr7 >= 160 && daysSinceLast <= 1) {
    title = 'Heart-rate load high';
    tip = `7-day avg HR ~${Math.round(avgHr7)} bpm with ${weekKm.toFixed(1)} km volume. Schedule recovery: easy ${Math.max(4, Math.min(7, last.distance * 0.6)).toFixed(0)} km or full rest, then resume long-run build toward ${targetLong} km.`;
    action = 'Recovery / easy only';
  } else if (ratio < 0.55) {
    title = 'Build the long run';
    tip = `Peak long run ${recentPeak.toFixed(1)} km (${Math.round(ratio * 100)}% of ${distanceGoal.toFixed(1)} km goal). Recent pace ~${fmtPace(avgPace3)}/km, speed ~${avgSpeed3.toFixed(1)} km/h. Weekend target ~${nextLong} km easy.`;
    action = `Long run ${nextLong} km`;
  } else if (weekKm < (distanceGoal >= 40 ? 40 : distanceGoal >= 20 ? 28 : 18) * 0.7) {
    const weekTarget = distanceGoal >= 40 ? 40 : distanceGoal >= 20 ? 28 : 18;
    title = 'Volume below target';
    tip = `This week ${weekKm.toFixed(1)} km across ${last7.length} run${last7.length === 1 ? '' : 's'} (30d: ${last30.length} runs). Add a mid-week ${Math.max(6, Math.round((weekTarget - weekKm) / 2))} km aerobic run toward ~${weekTarget} km.`;
    action = `+${Math.max(6, Math.round((weekTarget - weekKm) / 2))} km mid-week`;
  } else if (avgPace3 > 8.5 && recentPeak >= 8) {
    title = 'Inject controlled speed';
    tip = `Long-run base OK (${recentPeak.toFixed(1)} km) but pace sits ~${fmtPace(avgPace3)}/km. Keep one quality day: 6–8×400m or 20–25 min tempo after warm-up; protect easy days and long run.`;
    action = 'Tempo / intervals';
  } else if (ratio < 0.75) {
    title = 'Stretch long-run ceiling';
    tip = `Peak ${recentPeak.toFixed(1)} km. Next long: ${nextLong} km easy finishing controlled. Goal still wants ~${targetLong} km. Watch HR drift — stay aerobic until final 2 km.`;
    action = `Long run ${nextLong} km`;
  } else {
    const readinessNote = readiness?.readinessPercent != null ? ` Race fitness ~${readiness.readinessPercent}%.` : '';
    tip = `Base looks solid (peak ${recentPeak.toFixed(1)} km, 7d ${weekKm.toFixed(1)} km, pace ~${fmtPace(avgPace3)}/km). Keep weekly volume, one quality session, long run near ${Math.min(targetLong, recentPeak + 1).toFixed(1)} km.${readinessNote}`;
  }

  if (body.percent >= 85 && daysSinceLast >= 1 && daysSinceLast <= 3 && !String(action).toLowerCase().includes('recovery')) {
    title = body.percent >= 90 ? 'Prime window' : 'Ready to push';
    tip = `${body.why} ${tip}`;
  }

  return {
    title,
    tip,
    action,
    nextWhen,
    fuel,
    hydration,
    sleep,
    confidence: body.percent / 100,
    bodyReadiness: body,
    meta: {
      weekKm: Number(weekKm.toFixed(1)),
      runs7: last7.length,
      runs30: last30.length,
      avgPace3,
      avgSpeed3: Number(avgSpeed3.toFixed(2)),
      avgHr7: avgHr7 ? Math.round(avgHr7) : null,
      recentPeak: Number(recentPeak.toFixed(1)),
      daysSinceLast,
      bodyReadiness: body.percent,
    },
  };
}
