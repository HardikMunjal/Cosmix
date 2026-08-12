/**
 * Data-based Cosmix coaching engine (free, no API key required).
 * Optional Groq / Gemini keys only polish Advanced wording.
 */

function hourFromRun(row) {
  const raw = String(row.startTime || row.date || '');
  const match = raw.match(/T(\d{2})/);
  if (match) return Number(match[1]);
  return null;
}

function fmtPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const age = (Date.now() - new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).getTime()) / 86400000;
  return Number.isFinite(age) ? Math.max(0, Math.round(age)) : null;
}

function summarizeRuns(runRows = []) {
  const runs = (Array.isArray(runRows) ? runRows : [])
    .filter((r) => Number(r.distance || 0) > 0 && Number(r.minutes || 0) > 0)
    .map((r) => ({
      date: String(r.date || '').slice(0, 10),
      distance: Number(r.distance),
      minutes: Number(r.minutes),
      pace: Number(r.minutes) / Number(r.distance),
      speed: Number(r.distance) / (Number(r.minutes) / 60),
      avgHr: Number(r.avgHeartrate || r.avgHeartRate || 0) || null,
      maxHr: Number(r.maxHeartrate || r.maxHeartRate || 0) || null,
      hour: hourFromRun(r),
      bestSplitPace: Number(r.bestSplitPaceMinPerKm || 0) || null,
      name: r.name || 'Run',
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const last30 = runs.filter((r) => {
    const age = (Date.now() - new Date(`${r.date}T12:00:00`).getTime()) / 86400000;
    return age <= 30;
  });
  const last7 = runs.filter((r) => {
    const age = (Date.now() - new Date(`${r.date}T12:00:00`).getTime()) / 86400000;
    return age <= 7;
  });
  const last14 = runs.filter((r) => {
    const age = (Date.now() - new Date(`${r.date}T12:00:00`).getTime()) / 86400000;
    return age <= 14;
  });

  const hours = runs.map((r) => r.hour).filter((h) => h != null);
  const morningCount = hours.filter((h) => h >= 4 && h <= 9).length;
  const typicalHour = hours.length
    ? Math.round(hours.reduce((s, h) => s + h, 0) / hours.length)
    : 6;
  const morningBias = hours.length ? morningCount / hours.length >= 0.5 : true;

  const hrRuns = last30.filter((r) => r.avgHr);
  const avgHr = hrRuns.length
    ? Math.round(hrRuns.reduce((s, r) => s + r.avgHr, 0) / hrRuns.length)
    : null;
  const maxHrSeen = runs.reduce((m, r) => Math.max(m, r.maxHr || r.avgHr || 0), 0) || null;
  const estMaxHr = Math.max(maxHrSeen || 0, 185);
  const z2Min = Math.round(estMaxHr * 0.6);
  const z2Max = Math.round(estMaxHr * 0.7);
  const z3Min = Math.round(estMaxHr * 0.7);
  const z3Max = Math.round(estMaxHr * 0.8);
  const inZ2Count = hrRuns.filter((r) => r.avgHr >= z2Min && r.avgHr < z2Max).length;
  const aboveZ2Count = hrRuns.filter((r) => r.avgHr >= z2Max).length;
  const spikeRuns = hrRuns.filter((r) => r.maxHr && r.avgHr && r.maxHr - r.avgHr >= 25);
  const highAvgRuns = hrRuns.filter((r) => r.avgHr >= 160);

  const paces = last30.map((r) => r.pace);
  const avgPace = paces.length ? paces.reduce((s, p) => s + p, 0) / paces.length : null;
  const recent3 = last30.slice(0, 3);
  const prior3 = last30.slice(3, 6);
  const recentPace = recent3.length ? recent3.reduce((s, r) => s + r.pace, 0) / recent3.length : null;
  const priorPace = prior3.length ? prior3.reduce((s, r) => s + r.pace, 0) / prior3.length : null;
  const paceTrend = (recentPace && priorPace)
    ? (recentPace < priorPace - 0.15 ? 'faster' : recentPace > priorPace + 0.15 ? 'slower' : 'steady')
    : null;

  const bestSplit = [...runs]
    .filter((r) => r.bestSplitPace)
    .sort((a, b) => a.bestSplitPace - b.bestSplitPace)[0] || null;
  const peakKm = last30.reduce((m, r) => Math.max(m, r.distance), 0);
  const weekKm = last7.reduce((s, r) => s + r.distance, 0);
  const fortnightKm = last14.reduce((s, r) => s + r.distance, 0);
  const lastRun = runs[0] || null;
  const gapDays = lastRun ? daysSince(lastRun.date) : null;

  return {
    runs,
    last30,
    last7,
    last14,
    typicalHour,
    morningBias,
    avgHr,
    maxHrSeen,
    estMaxHr,
    z2Min,
    z2Max,
    z3Min,
    z3Max,
    inZ2Count,
    aboveZ2Count,
    spikeRuns,
    highAvgRuns,
    avgPace,
    recentPace,
    priorPace,
    paceTrend,
    bestSplit,
    peakKm,
    weekKm,
    fortnightKm,
    lastRun,
    gapDays,
    runCount30: last30.length,
    runCount7: last7.length,
    hrSampleCount: hrRuns.length,
  };
}

function morningFuelPlan(hour) {
  if (hour <= 5) {
    return {
      title: 'Pre-dawn fuel (≤5am)',
      body: 'Keep it tiny and fast: 1 banana or 2 dates + 150–200 ml water on waking. Skip dairy and heavy oats. Coffee optional after water. Full breakfast after the run.',
    };
  }
  if (hour <= 7) {
    return {
      title: 'Classic 6–7am fuel',
      body: 'Wake 45–60 min early: banana + 1 toast with peanut butter, or 2 dates + black coffee/tea. 300 ml water. Avoid large milk/curd before the run.',
    };
  }
  if (hour <= 9) {
    return {
      title: 'Late-morning window',
      body: 'Light toast + fruit 60–75 min before, or a small oats bowl. Hydrate 350–400 ml. Carry electrolytes if it is already warm.',
    };
  }
  return {
    title: 'Daytime / evening fuel',
    body: 'Normal meal 2.5–3h before, then a small carb snack 45–60 min pre-run. Avoid fried food. Hydrate through the afternoon.',
  };
}

function detectFocus(ask = '') {
  const askLower = String(ask || '').toLowerCase();
  if (
    askLower.includes('last run')
    || askLower.includes('my last')
    || askLower.includes('how was')
    || askLower.includes('how did')
    || askLower.includes('yesterday')
    || (askLower.includes('improve') && (askLower.includes('run') || askLower.includes('pace')))
    || askLower.includes('could i pace')
    || askLower.includes('slow down')
  ) return 'lastrun';
  if (askLower.includes('fat') || askLower.includes('burn') || askLower.includes('zone') || askLower.includes('aerobic')) return 'fat';
  if (askLower.includes('eat') || askLower.includes('food') || askLower.includes('fuel') || askLower.includes('breakfast')) return 'fuel';
  if (askLower.includes('speed') || askLower.includes('pace') || askLower.includes('fast') || askLower.includes('split')) return 'speed';
  if (askLower.includes('spike')) return 'spike';
  if (askLower.includes('heart') || askLower.includes('hr') || askLower.includes('bpm')) return 'hr';
  return null;
}

function buildLastRunDeepReview(s) {
  const last = s.lastRun;
  if (!last) {
    return {
      id: 'lastrun',
      title: 'Your last run',
      body: 'No recent run logged yet. Sync Strava or log a run, then ask again — Cosmix will compare pace, HR, and volume to your history.',
    };
  }

  const vsAvgPace = s.avgPace ? last.pace - s.avgPace : null;
  const prior3 = s.last30.slice(1, 4);
  const priorPace = prior3.length ? prior3.reduce((sum, r) => sum + r.pace, 0) / prior3.length : null;

  const paceNote = vsAvgPace != null
    ? (vsAvgPace > 0.2
      ? `${last.distance.toFixed(1)} km at ${fmtPace(last.pace)}/km — about ${fmtPace(Math.abs(vsAvgPace))} slower than your 30-day avg (${fmtPace(s.avgPace)}/km). Good if this was recovery; if not intentional, start 15–20 sec/km slower next time.`
      : vsAvgPace < -0.2
        ? `${last.distance.toFixed(1)} km at ${fmtPace(last.pace)}/km — ${fmtPace(Math.abs(vsAvgPace))} faster than 30-day avg. Strong day; follow with easy Z2 or rest.`
        : `${last.distance.toFixed(1)} km at ${fmtPace(last.pace)}/km — matches your recent average pace.`)
    : `${last.distance.toFixed(1)} km in ${Math.round(last.minutes)} min (${fmtPace(last.pace)}/km).`;

  const hrNote = last.avgHr
    ? (last.avgHr >= s.z3Max
      ? `Avg HR ${last.avgHr} bpm — mostly aerobic/threshold (above fat-burn Z2 ${s.z2Min}–${s.z2Max}). For base work, slow until HR sits in Z2 for the first 70% of the run.`
      : last.avgHr >= s.z2Max
        ? `Avg HR ${last.avgHr} bpm — upper easy/aerobic. OK for moderate days; for fat-burn focus, cap effort so HR stays ${s.z2Min}–${s.z2Max}.`
        : `Avg HR ${last.avgHr} bpm — solid easy-zone work${s.avgHr ? ` (30d avg ${s.avgHr} bpm)` : ''}.`)
    : 'No HR on this run — enable watch/Strava sync for pace-vs-HR advice.';

  const whenSlow = [];
  if (last.avgHr && last.avgHr > s.z2Max) {
    whenSlow.push(`From km 1: you averaged ${last.avgHr} bpm — aim ${s.z2Min}–${s.z2Max} bpm for the first 2–3 km next time.`);
  }
  if (priorPace && last.pace < priorPace - 0.2) {
    whenSlow.push(`You went out faster than your prior 3 runs (${fmtPace(priorPace)}/km avg) — hold km 1–2 back by 20–30 sec/km.`);
  }
  if (last.maxHr && last.avgHr && last.maxHr - last.avgHr >= 20) {
    whenSlow.push(`HR peaked ${last.maxHr - last.avgHr} bpm above average — walk 60s whenever HR jumps >10 bpm in a minute (hills, heat, caffeine).`);
  }
  if (last.distance >= 8 && last.avgHr && s.avgHr && last.avgHr > s.avgHr + 5) {
    whenSlow.push(`On runs ≥8 km, if avg HR exceeds ${s.z2Max} bpm before halfway, drop pace 15–20 sec/km.`);
  }

  const whenPush = [];
  if (last.avgHr && last.avgHr <= s.z2Max && vsAvgPace != null && vsAvgPace > 0.15) {
    whenPush.push(`HR had room (${last.avgHr} bpm in Z2) but pace was conservative — last 1–2 km could be 10–15 sec/km quicker if legs felt good.`);
  }
  if (last.bestSplitPace && last.pace && last.bestSplitPace < last.pace - 0.3) {
    whenPush.push(`Best km was ${fmtPace(last.bestSplitPace)}/km vs ${fmtPace(last.pace)}/km avg — use that split for intervals, not the whole run.`);
  }
  if (last.avgHr && last.avgHr < s.z2Min && last.pace > (s.avgPace || last.pace) + 0.1) {
    whenPush.push(`HR was very low (${last.avgHr} bpm) with slow pace — you could add 4×20s strides at the end if the run felt too easy.`);
  }

  let trendNote = '';
  if (priorPace) {
    trendNote = last.pace > priorPace + 0.1
      ? ` Compared to your prior 3 runs (${fmtPace(priorPace)}/km), this was a slower day — good for recovery.`
      : last.pace < priorPace - 0.1
        ? ` Compared to prior 3 runs, this was faster — watch fatigue tomorrow.`
        : ' Consistent with your last few runs.';
  }

  const nextNote = s.gapDays === 0
    ? 'You ran today — tomorrow should be rest or very easy 20–30 min Z2.'
    : s.gapDays != null && s.gapDays <= 2
      ? 'Next run: easy Z2 unless legs feel fresh.'
      : 'Next run: resume your normal plan if recovery felt good.';

  return {
    id: 'lastrun',
    title: `Last run · ${last.date} · ${last.distance.toFixed(1)} km`,
    body: [
      paceNote + trendNote,
      hrNote,
      whenSlow.length ? `When to slow down: ${whenSlow.join(' ')}` : null,
      whenPush.length ? `When you could push: ${whenPush.join(' ')}` : null,
      last.bestSplitPace ? `Fastest km in that run: ${fmtPace(last.bestSplitPace)}/km.` : null,
      nextNote,
    ].filter(Boolean).join('\n\n'),
  };
}

export function buildAdvancedCoachPayload({ runRows = [], ask = '', tip = null } = {}) {
  const s = summarizeRuns(runRows);
  const fuel = morningFuelPlan(s.typicalHour);
  const sections = [];
  const focus = detectFocus(ask);
  const userAsk = String(ask || '').trim() || 'Give a full data-based coaching briefing.';

  if (focus === 'lastrun' || !ask) {
    sections.push(buildLastRunDeepReview(s));
  }

  sections.push({
    id: 'schedule',
    title: 'Your run clock',
    body: s.morningBias
      ? `From ${s.runs.length} logged runs, most start near ~${String(s.typicalHour).padStart(2, '0')}:00. Fuel and HR advice below are tuned for that window.`
      : `Start times vary across ${s.runs.length} runs. Using ~${String(s.typicalHour).padStart(2, '0')}:00 as your average start for nutrition timing.`,
  });

  sections.push({
    id: 'fuel',
    title: fuel.title,
    body: fuel.body,
  });

  sections.push({
    id: 'fat',
    title: 'Stay in fat-burning (Z2)',
    body: s.hrSampleCount
      ? `Using max HR reference ~${s.estMaxHr} bpm: fat-burning Z2 is roughly ${s.z2Min}–${s.z2Max} bpm; aerobic Z3 is ${s.z3Min}–${s.z3Max} bpm. Your recent avg HR is ~${s.avgHr} bpm`
        + (s.aboveZ2Count > s.inZ2Count
          ? ` — ${s.aboveZ2Count}/${s.hrSampleCount} recent HR runs sit at/above Z2. Slow until you can talk in full sentences; watch the band ${s.z2Min}–${s.z2Max}.`
          : ` — many easy runs already sit near Z2. Keep long runs there; save surges for one quality day.`)
      : `No enough HR samples yet. Fat-burning is usually ~60–70% of max HR. Use talk-test: easy = full sentences. Sync HR on next runs for exact bpm bands.`,
  });

  sections.push({
    id: 'speed',
    title: 'Speed & 1 km split plan',
    body: s.bestSplit
      ? `Best 1 km split: ${fmtPace(s.bestSplit.bestSplitPace)}/km`
        + (s.paceTrend ? ` · last-3 pace trend: ${s.paceTrend}` : '')
        + `. Keep one quality day/week (6–8×400m or 4×1 km a touch faster than that split). Easy days must stay easy or HR climbs and speed stalls.`
      : `No clean 1 km split yet`
        + (s.avgPace ? ` (rolling pace ~${fmtPace(s.avgPace)}/km)` : '')
        + `. Until splits sync: finish one easy run/week with 4×20s strides. Do not turn every run into a race.`,
  });

  sections.push({
    id: 'hr',
    title: 'Heart-rate guidance',
    body: s.avgHr
      ? (s.avgHr >= 160
        ? `30d avg HR ~${s.avgHr} bpm is high for base work. Cap most runs in Z2 (${s.z2Min}–${s.z2Max}). Nose-breathing check: if you cannot speak, slow down.`
        : `30d avg HR ~${s.avgHr} bpm looks usable. Keep long runs aerobic; limit drift to ~10 bpm start→finish. Peak seen ~${s.maxHrSeen || '—'} bpm.`)
      : 'Enable watch/Strava HR so Cosmix can lock Z2/Z3 bands from your data.',
  });

  sections.push({
    id: 'spike',
    title: 'If HR spikes mid-run',
    body: s.spikeRuns.length
      ? `${s.spikeRuns.length} recent run(s) had max HR ≥25 bpm above average. Protocol: walk 60–90s, sip water, drop cadence, resume only after HR falls ~15–20 bpm. Check heat, caffeine, sleep, and hills.`
      : 'Sudden spike: walk, hydrate, check heat/caffeine. Stop for chest pain or dizziness. Resume only at easy pace in Z2.',
  });

  sections.push({
    id: 'volume',
    title: 'Volume & consistency',
    body: `7d ${s.weekKm.toFixed(1)} km (${s.runCount7} runs) · 14d ${s.fortnightKm.toFixed(1)} km · 30d peak long ${s.peakKm.toFixed(1)} km`
      + (s.gapDays != null ? ` · last run ${s.gapDays === 0 ? 'today' : `${s.gapDays}d ago`}` : '')
      + (s.lastRun ? ` (${s.lastRun.distance.toFixed(1)} km)` : '')
      + '. Raise long-run distance ≤10%/week when HR stays controlled.',
  });

  if (tip?.action) {
    sections.push({
      id: 'next',
      title: 'Next session lock',
      body: `Action: ${tip.action}. ${tip.nextWhen || ''} ${tip.hydration || ''}`.trim(),
    });
  }

  const focusResolved = focus;
  const ordered = focusResolved
    ? [...sections.filter((sct) => sct.id === focusResolved), ...sections.filter((sct) => sct.id !== focusResolved)]
    : sections;

  const headline = focusResolved === 'lastrun'
    ? `Last run analysis · ${s.lastRun ? `${s.lastRun.distance.toFixed(1)} km` : 'sync a run'}`
    : focusResolved === 'fuel'
    ? `Fuel plan for ~${String(s.typicalHour).padStart(2, '0')}:00 runs`
    : focusResolved === 'fat'
      ? 'Fat-burning zone guide'
      : focusResolved === 'speed'
        ? 'Speed protocol from your splits'
        : focusResolved === 'hr' || focusResolved === 'spike'
          ? 'Heart-rate control playbook'
          : s.lastRun
            ? `Coaching · last run ${s.lastRun.date}`
            : 'Data-based Cosmix briefing';

  const lastRunAnalysis = buildLastRunDeepReview(s);

  return {
    mode: 'advanced',
    engine: 'cosmix-local',
    headline,
    focus: focusResolved,
    summary: {
      typicalHour: s.typicalHour,
      morningBias: s.morningBias,
      weekKm: Number(s.weekKm.toFixed(1)),
      fortnightKm: Number(s.fortnightKm.toFixed(1)),
      peakKm: Number(s.peakKm.toFixed(1)),
      avgHr: s.avgHr,
      avgPace: s.avgPace,
      bestSplitPace: s.bestSplit?.bestSplitPace || null,
      runs7: s.runCount7,
      runs30: s.runCount30,
      gapDays: s.gapDays,
      z2Min: s.z2Min,
      z2Max: s.z2Max,
      paceTrend: s.paceTrend,
    },
    sections: ordered,
    ask: ask || null,
    contextForLlm: {
      userQuestion: userAsk,
      lastRunDeepReview: lastRunAnalysis.body,
      typicalHour: s.typicalHour,
      morningBias: s.morningBias,
      weekKm: s.weekKm,
      fortnightKm: s.fortnightKm,
      peakKm: s.peakKm,
      avgHr: s.avgHr,
      maxHrSeen: s.maxHrSeen,
      estMaxHr: s.estMaxHr,
      z2Bpm: [s.z2Min, s.z2Max],
      z3Bpm: [s.z3Min, s.z3Max],
      inZ2Count: s.inZ2Count,
      aboveZ2Count: s.aboveZ2Count,
      avgPaceMinPerKm: s.avgPace,
      recentPaceMinPerKm: s.recentPace,
      priorPaceMinPerKm: s.priorPace,
      paceTrend: s.paceTrend,
      bestSplitPaceMinPerKm: s.bestSplit?.bestSplitPace || null,
      spikeRunCount: s.spikeRuns.length,
      highAvgHrRunCount: s.highAvgRuns.length,
      gapDays: s.gapDays,
      lastRun: s.lastRun ? {
        date: s.lastRun.date,
        km: s.lastRun.distance,
        minutes: s.lastRun.minutes,
        pace: s.lastRun.pace,
        avgHr: s.lastRun.avgHr,
        maxHr: s.lastRun.maxHr,
        bestSplitPace: s.lastRun.bestSplitPace,
      } : null,
      recentRuns: s.last30.slice(0, 16).map((r) => ({
        date: r.date,
        km: Number(r.distance.toFixed(1)),
        pace: Number(r.pace.toFixed(2)),
        avgHr: r.avgHr,
        maxHr: r.maxHr,
        hour: r.hour,
        bestSplitPace: r.bestSplitPace,
      })),
      tipAction: tip?.action || null,
      userAsk,
    },
  };
}

function firstSentence(text = '', max = 140) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const cut = raw.split(/(?<=[.!?])\s+/)[0] || raw;
  if (cut.length <= max) return cut;
  return `${cut.slice(0, max - 1).trim()}…`;
}

/** Compact quick-guide view model from the same engine. */
export function buildQuickGuideFromEngine({ runRows = [], tip = null } = {}) {
  const payload = buildAdvancedCoachPayload({ runRows, tip, ask: '' });
  const s = payload.summary;
  const byId = Object.fromEntries(payload.sections.map((sec) => [sec.id, sec]));

  const z2Line = s.z2Min != null
    ? `Keep easy runs in Z2 ${s.z2Min}–${s.z2Max} bpm`
    : 'Keep easy runs conversational (talk-test)';
  const hrLine = s.avgHr != null ? ` (your 30d avg ~${s.avgHr} bpm)` : '';
  const volLine = `Last 7d: ${s.weekKm} km across ${s.runs7} run${s.runs7 === 1 ? '' : 's'}`;
  const startLine = s.typicalHour != null
    ? `Typical start ~${String(s.typicalHour).padStart(2, '0')}:00`
    : null;

  const tipBody = [
    z2Line + hrLine + '.',
    volLine + (startLine ? ` · ${startLine}` : '') + '.',
    tip?.action ? `Next: ${tip.action}.` : null,
  ].filter(Boolean).join(' ');

  const fuelShort = tip?.fuel || firstSentence(byId.fuel?.body, 110);
  const hrShort = firstSentence(byId.fat?.body || byId.hr?.body, 120);

  return {
    ...payload,
    mode: 'quick',
    title: tip?.title || 'Data-based quick guide',
    tip: tipBody,
    action: tip?.action || null,
    protocols: [
      { label: 'When', value: tip?.nextWhen || (s.gapDays === 0 ? 'Optional easy / rest today' : 'Within 24 hours') },
      { label: 'Fuel', value: fuelShort },
      { label: 'HR / Z2', value: hrShort },
      { label: 'Sleep', value: tip?.sleep },
    ].filter((row) => row.value),
    confidence: tip?.bodyReadiness?.percent != null
      ? tip.bodyReadiness.percent / 100
      : (tip?.confidence ?? 0.7),
    bodyReadiness: tip?.bodyReadiness || null,
    metaChips: [
      tip?.bodyReadiness?.percent != null
        ? { k: 'Ready', v: `${tip.bodyReadiness.percent}% · ${tip.bodyReadiness.label || ''}` }
        : null,
      tip?.bodyReadiness?.daysSinceLast != null
        ? { k: 'Rest', v: tip.bodyReadiness.daysSinceLast === 0 ? 'Ran today' : `${tip.bodyReadiness.daysSinceLast}d` }
        : null,
      s.weekKm != null ? { k: '7d', v: `${s.weekKm} km` } : null,
      s.runs7 != null ? { k: 'Runs', v: String(s.runs7) } : null,
      s.avgHr != null ? { k: 'HR', v: String(s.avgHr) } : null,
      s.typicalHour != null ? { k: 'Start', v: `${String(s.typicalHour).padStart(2, '0')}:00` } : null,
      s.z2Min != null ? { k: 'Z2', v: `${s.z2Min}-${s.z2Max}` } : null,
      s.paceTrend ? { k: 'Pace', v: s.paceTrend } : null,
    ].filter(Boolean),
  };
}

export function parseMarkdownSections(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const chunks = raw.split(/\n(?=#{1,3}\s+)/);
  const sections = [];
  chunks.forEach((chunk) => {
    const match = chunk.match(/^#{1,3}\s+(.+?)\n([\s\S]*)$/);
    if (match) {
      sections.push({
        id: `md-${sections.length}`,
        title: match[1].replace(/\*+/g, '').trim(),
        body: match[2].replace(/\*+/g, '').trim(),
      });
    }
  });
  return sections;
}

export function localAdvancedReply(payload) {
  return [
    payload.headline,
    '',
    ...payload.sections.map((s) => `### ${s.title}\n${s.body}`),
  ].join('\n');
}
