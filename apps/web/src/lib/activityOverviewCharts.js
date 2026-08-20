import { buildRunningRows } from './runningShoes';
import { DepthBars } from './RunningModernCharts';
import { hrZoneForBpm } from './hrZones';

export function fmtActivityMins(mins) {
  if (!mins || mins <= 0) return '--';
  const total = Math.round(Number(mins) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function buildWeeklySumBuckets(rows = [], valueFn, weeks = 12) {
  const weekMap = new Map();
  (rows || []).forEach((row) => {
    const date = String(row.date || '').slice(0, 10);
    const value = Number(valueFn(row) || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(value > 0)) return;
    const d = new Date(`${date}T12:00:00`);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weekMap.set(key, (weekMap.get(key) || 0) + value);
  });
  return [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-weeks)
    .map(([week, value]) => ({
      date: week,
      label: new Date(`${week}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      value: Number(value.toFixed(1)),
    }));
}

export function buildSportActivityRows(entries = [], { arrayKey, minutesKey, distanceKey = null, defaultName = 'Session' } = {}) {
  const rows = [];
  [...(entries || [])].forEach((entry) => {
    const activities = Array.isArray(entry?.[arrayKey]) ? entry[arrayKey] : [];
    if (activities.length) {
      activities.forEach((act) => {
        const minutes = Number(act.minutes || 0);
        const distance = Number(act.distanceKm || 0);
        if (minutes <= 0 && distance <= 0) return;
        const pace = distance > 0 && minutes > 0 ? minutes / distance : (Number(act.paceMinPerKm) || null);
        rows.push({
          date: act.date || entry.date,
          minutes,
          distance,
          name: act.name || defaultName,
          avgHeartrate: Number(act.avgHeartrate || 0) || null,
          maxHeartrate: Number(act.maxHeartrate || 0) || null,
          avgSpeedKmh: Number(act.avgSpeedKmh || 0) || null,
          paceMinPerKm: pace,
          calories: Number(act.calories || 0) || null,
          stravaId: Number(act.id || act.stravaId || 0) || null,
          source: 'strava',
        });
      });
      return;
    }

    const dayMinutes = Number(entry?.[minutesKey] || 0);
    const dayDistance = distanceKey ? Number(entry?.[distanceKey] || 0) : 0;
    if (dayMinutes <= 0 && dayDistance <= 0) return;
    rows.push({
      date: entry.date,
      minutes: dayMinutes,
      distance: dayDistance,
      name: defaultName,
      avgHeartrate: Number(entry.stravaAvgHeartRate || entry.heartRateAvg || 0) || null,
      maxHeartrate: Number(entry.stravaMaxHeartRate || entry.heartRateMax || 0) || null,
      avgSpeedKmh: null,
      paceMinPerKm: dayDistance > 0 && dayMinutes > 0 ? dayMinutes / dayDistance : null,
      stravaId: null,
      source: entry.source || 'manual',
    });
  });
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function buildSportHrSummary(rows = []) {
  const withHr = (rows || []).filter((r) => Number(r.avgHeartrate || 0) > 0);
  if (!withHr.length) {
    return { avgHr: null, maxHr: null, sessionsWithHr: 0, zoneMix: [] };
  }
  const avgHr = Math.round(withHr.reduce((s, r) => s + Number(r.avgHeartrate), 0) / withHr.length);
  const maxHr = withHr.reduce((best, r) => Math.max(best, Number(r.maxHeartrate || r.avgHeartrate || 0)), 0);
  const zoneMap = new Map();
  withHr.forEach((r) => {
    const zone = hrZoneForBpm(Number(r.avgHeartrate));
    if (!zone) return;
    const key = zone.label || `Z${zone.zone}`;
    zoneMap.set(key, (zoneMap.get(key) || 0) + 1);
  });
  const zoneMix = [...zoneMap.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / withHr.length) * 100) }))
    .sort((a, b) => b.count - a.count);
  return { avgHr, maxHr, sessionsWithHr: withHr.length, zoneMix };
}

export function buildSleepRecoveryModel(entries = []) {
  const sleepRows = (entries || [])
    .map((e) => ({
      date: String(e.date || '').slice(0, 10),
      sleepHours: Number(e.sleepHours || e.stravaSleepHours || 0),
      stravaSleepHours: Number(e.stravaSleepHours || 0),
      meditationMinutes: Number(e.meditationMinutes || 0),
      avgHr: Number(e.stravaAvgHeartRate || e.heartRateAvg || 0) || null,
      yogaMinutes: Number(e.yogaMinutes || 0),
      badmintonMinutes: Number(e.badmintonMinutes || 0),
      swimmingMinutes: Number(e.swimmingMinutes || 0),
      cyclingMinutes: Number(e.cyclingMinutes || 0),
      runningMinutes: Number(e.runningMinutes || 0),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const withSleep = sleepRows.filter((r) => r.sleepHours > 0);
  const last14 = sleepRows.slice(-14);
  const avgSleep = withSleep.length
    ? Number((withSleep.reduce((s, r) => s + r.sleepHours, 0) / withSleep.length).toFixed(1))
    : null;
  const lastNight = [...withSleep].reverse()[0] || null;
  const recoveryScore = (() => {
    if (!last14.length) return null;
    let score = 55;
    const sleepAvg = last14.filter((r) => r.sleepHours > 0);
    if (sleepAvg.length) {
      const avg = sleepAvg.reduce((s, r) => s + r.sleepHours, 0) / sleepAvg.length;
      score += Math.max(-15, Math.min(20, (avg - 7) * 8));
    }
    const medMins = last14.reduce((s, r) => s + r.meditationMinutes, 0);
    score += Math.min(10, medMins / 30);
    const loadMins = last14.reduce((s, r) => s + r.runningMinutes + r.badmintonMinutes + r.cyclingMinutes + r.swimmingMinutes, 0);
    if (loadMins > 400) score -= 8;
    else if (loadMins > 250) score -= 3;
    const hrDays = last14.filter((r) => r.avgHr > 0);
    if (hrDays.length >= 3) {
      const hrs = hrDays.map((r) => r.avgHr);
      const mean = hrs.reduce((s, v) => s + v, 0) / hrs.length;
      const recent = hrs.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, hrs.length);
      if (recent > mean + 8) score -= 6;
      if (recent < mean - 5) score += 4;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  })();

  const sleepTrend = withSleep.slice(-14).map((r) => ({
    date: r.date,
    label: new Date(`${r.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    value: r.sleepHours,
  }));

  return {
    avgSleep,
    lastNight,
    recoveryScore,
    sleepTrend,
    withSleepCount: withSleep.length,
    meditationWeekMins: last14.reduce((s, r) => s + r.meditationMinutes, 0),
  };
}

export function buildActivityOverviewModel(entries = [], theme = {}) {
  const walkRows = buildSportActivityRows(entries, {
    arrayKey: 'stravaWalks',
    minutesKey: 'walkingMinutes',
    distanceKey: 'walkingDistanceKm',
    defaultName: 'Walk',
  });
  const yogaRows = buildSportActivityRows(entries, {
    arrayKey: 'stravaYoga',
    minutesKey: 'yogaMinutes',
    defaultName: 'Yoga',
  });
  const runRows = buildRunningRows(entries);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const inWeek = (row) => String(row.date || '') >= weekAgoStr;

  const sumMins = (rows) => rows.reduce((s, r) => s + (r.minutes || 0), 0);
  const sumDist = (rows) => rows.reduce((s, r) => s + (r.distance || 0), 0);

  const cyclingRows = buildSportActivityRows(entries, { arrayKey: 'stravaRides', minutesKey: 'cyclingMinutes', distanceKey: 'cyclingDistanceKm', defaultName: 'Ride' });
  const swimRows = buildSportActivityRows(entries, { arrayKey: 'stravaSwims', minutesKey: 'swimmingMinutes', defaultName: 'Swim' });
  const badmintonRows = buildSportActivityRows(entries, { arrayKey: 'stravaBadminton', minutesKey: 'badmintonMinutes', defaultName: 'Badminton' });
  const meditationRows = buildSportActivityRows(entries, { arrayKey: 'stravaMeditation', minutesKey: 'meditationMinutes', defaultName: 'Meditation' });

  const activities = [
    { label: 'Running', emoji: '🏃', key: 'running', sessions: runRows.length, mins: sumMins(runRows), distance: sumDist(runRows), accent: theme.green || '#22c55e', weeklyMins: sumMins(runRows.filter(inWeek)), rows: runRows, hr: buildSportHrSummary(runRows) },
    { label: 'Walking', emoji: '🚶', key: 'walking', sessions: walkRows.length, mins: sumMins(walkRows), distance: sumDist(walkRows), accent: theme.cyan || '#38bdf8', weeklyMins: sumMins(walkRows.filter(inWeek)), rows: walkRows, hr: buildSportHrSummary(walkRows) },
    { label: 'Yoga', emoji: '🧘', key: 'yoga', sessions: yogaRows.length, mins: sumMins(yogaRows), distance: 0, accent: theme.purple || '#a855f7', weeklyMins: sumMins(yogaRows.filter(inWeek)), rows: yogaRows, hr: buildSportHrSummary(yogaRows) },
    { label: 'Cycling', emoji: '🚴', key: 'cycling', sessions: cyclingRows.length, mins: sumMins(cyclingRows), distance: sumDist(cyclingRows), accent: theme.blue || '#60a5fa', weeklyMins: sumMins(cyclingRows.filter(inWeek)), rows: cyclingRows, hr: buildSportHrSummary(cyclingRows) },
    { label: 'Swimming', emoji: '🏊', key: 'swimming', sessions: swimRows.length, mins: sumMins(swimRows), distance: 0, accent: theme.purple || '#a855f7', weeklyMins: sumMins(swimRows.filter(inWeek)), rows: swimRows, hr: buildSportHrSummary(swimRows) },
    { label: 'Badminton', emoji: '🏸', key: 'badminton', sessions: badmintonRows.length, mins: sumMins(badmintonRows), distance: 0, accent: theme.yellow || '#eab308', weeklyMins: sumMins(badmintonRows.filter(inWeek)), rows: badmintonRows, hr: buildSportHrSummary(badmintonRows) },
    { label: 'Meditation', emoji: '🕉️', key: 'meditation', sessions: meditationRows.length, mins: sumMins(meditationRows), distance: 0, accent: theme.cyan || '#22d3ee', weeklyMins: sumMins(meditationRows.filter(inWeek)), rows: meditationRows, hr: buildSportHrSummary(meditationRows) },
  ].filter((a) => a.sessions > 0 || a.mins > 0);

  const totalMins = activities.reduce((s, a) => s + a.mins, 0);
  const weeklyMix = buildWeeklySumBuckets(
    activities.flatMap((sport) => (sport.rows || []).map((row) => ({ date: row.date, minutes: row.minutes || 0 }))),
    (row) => row.minutes,
    8,
  );
  const sleepRecovery = buildSleepRecoveryModel(entries);

  return { activities, totalMins, weeklyMix, sleepRecovery };
}

export function ActivityBreakdownCard({ name, activities = [], totalMins = 0, theme, onActivityClick }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: 12 }}>
        {name ? `${name}'s Activity Breakdown` : 'Activity Breakdown'}
      </div>
      {!activities.length ? (
        <div style={{ padding: '28px 18px', borderRadius: 20, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>
          No activity logged yet. Sync Strava or add badminton, swim, cycle, meditation in Wellness.
        </div>
      ) : (
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: theme.textHeading }}>All Sports</span>
            <span style={{ fontSize: 13, color: theme.textSecondary }}>{fmtActivityMins(totalMins)} total activity</span>
          </div>
          {activities.map((a) => {
            const pct = totalMins > 0 ? Math.round((a.mins / totalMins) * 100) : 0;
            const clickable = typeof onActivityClick === 'function';
            const RowTag = clickable ? 'button' : 'div';
            const hrLabel = a.hr?.avgHr ? `${a.hr.avgHr} bpm` : null;
            return (
              <RowTag
                key={a.key}
                type={clickable ? 'button' : undefined}
                className="activity-breakdown-row"
                onClick={clickable ? () => onActivityClick(a.key, a) : undefined}
                style={{
                  padding: '14px 20px',
                  borderTop: `1px solid ${theme.cardBorder}`,
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(0, 1fr) auto auto 52px',
                  gap: 10,
                  alignItems: 'center',
                  width: '100%',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <span style={{ fontSize: 20 }}>{a.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: theme.textHeading, marginBottom: 5 }}>{a.label}</div>
                  <div style={{ height: 5, borderRadius: 3, background: theme.cardBorder, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: a.accent, borderRadius: 3 }} />
                  </div>
                  {hrLabel ? (
                    <div style={{ marginTop: 6, fontSize: 11, color: theme.textMuted }}>
                      Heartbeat focus · avg {hrLabel}
                      {a.hr?.maxHr ? ` · max ${a.hr.maxHr}` : ''}
                      {a.hr?.zoneMix?.[0] ? ` · mostly ${a.hr.zoneMix[0].label}` : ''}
                    </div>
                  ) : null}
                </div>
                <span style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'right', whiteSpace: 'nowrap' }}>{a.sessions} sessions</span>
                <span style={{ fontSize: 12, color: theme.textMuted, textAlign: 'right', whiteSpace: 'nowrap' }}>{a.distance > 0 ? `${Number(a.distance).toFixed(1)} km` : fmtActivityMins(a.mins)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: a.accent, textAlign: 'right' }}>{pct}%</span>
              </RowTag>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SleepRecoveryCard({ sleepRecovery, theme, name = '' }) {
  if (!sleepRecovery) return null;
  const { avgSleep, lastNight, recoveryScore, sleepTrend, withSleepCount, meditationWeekMins } = sleepRecovery;
  if (!withSleepCount && !meditationWeekMins && recoveryScore == null) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: 12 }}>
        {name ? `${name}'s Sleep & Recovery` : 'Sleep & Recovery'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 12 }}>
        <div style={{ padding: 14, borderRadius: 16, background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Recovery</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.textHeading }}>{recoveryScore != null ? `${recoveryScore}` : '--'}</div>
          <div style={{ fontSize: 11, color: theme.textSecondary }}>0–100 from sleep · load · HR</div>
        </div>
        <div style={{ padding: 14, borderRadius: 16, background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Avg sleep</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.textHeading }}>{avgSleep != null ? `${avgSleep}h` : '--'}</div>
          <div style={{ fontSize: 11, color: theme.textSecondary }}>{withSleepCount} nights logged</div>
        </div>
        <div style={{ padding: 14, borderRadius: 16, background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Last night</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.textHeading }}>{lastNight ? `${lastNight.sleepHours}h` : '--'}</div>
          <div style={{ fontSize: 11, color: theme.textSecondary }}>{lastNight ? lastNight.date : 'Add sleep or sync Strava sleep activity'}</div>
        </div>
      </div>
      {sleepTrend.length ? (
        <DepthBars
          title="Sleep hours"
          items={sleepTrend.map((w) => ({ label: w.label, value: w.value }))}
          theme={theme}
          accent={theme.purple || '#a855f7'}
          unit="h"
        />
      ) : (
        <div style={{ padding: '16px 18px', borderRadius: 16, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
          Strava does not always expose sleep. Log sleep in Wellness, or sync if your watch posts Sleep activities to Strava.
        </div>
      )}
    </div>
  );
}

export function ActivityOverviewCharts({ entries = [], name = '', theme, onActivityClick }) {
  const model = buildActivityOverviewModel(entries, theme);
  return (
    <div className="activity-overview-charts">
      <ActivityBreakdownCard name={name} activities={model.activities} totalMins={model.totalMins} theme={theme} onActivityClick={onActivityClick} />
      {model.weeklyMix.length ? (
        <DepthBars
          title="Activity minutes by week"
          items={model.weeklyMix.map((w) => ({ label: w.label, value: Math.round(w.value) }))}
          theme={theme}
          accent={theme.orange || '#fb923c'}
          unit="m"
        />
      ) : null}
      <SleepRecoveryCard sleepRecovery={model.sleepRecovery} theme={theme} name={name} />
    </div>
  );
}
