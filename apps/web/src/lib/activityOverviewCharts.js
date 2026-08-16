import { buildRunningRows } from './runningShoes';
import { DepthBars } from './RunningModernCharts';

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
  const badmintonRows = (entries || [])
    .filter((e) => Number(e.badmintonMinutes || 0) > 0)
    .map((e) => ({ date: e.date, minutes: Number(e.badmintonMinutes || 0), distance: 0 }));

  const activities = [
    { label: 'Running', emoji: '🏃', key: 'running', sessions: runRows.length, mins: sumMins(runRows), distance: sumDist(runRows), accent: theme.green || '#22c55e', weeklyMins: sumMins(runRows.filter(inWeek)), rows: runRows },
    { label: 'Walking', emoji: '🚶', key: 'walking', sessions: walkRows.length, mins: sumMins(walkRows), distance: sumDist(walkRows), accent: theme.cyan || '#38bdf8', weeklyMins: sumMins(walkRows.filter(inWeek)), rows: walkRows },
    { label: 'Yoga', emoji: '🧘', key: 'yoga', sessions: yogaRows.length, mins: sumMins(yogaRows), distance: 0, accent: theme.purple || '#a855f7', weeklyMins: sumMins(yogaRows.filter(inWeek)), rows: yogaRows },
    { label: 'Cycling', emoji: '🚴', key: 'cycling', sessions: cyclingRows.length, mins: sumMins(cyclingRows), distance: sumDist(cyclingRows), accent: theme.blue || '#60a5fa', weeklyMins: sumMins(cyclingRows.filter(inWeek)), rows: cyclingRows },
    { label: 'Swimming', emoji: '🏊', key: 'swimming', sessions: swimRows.length, mins: sumMins(swimRows), distance: 0, accent: theme.purple || '#a855f7', weeklyMins: sumMins(swimRows.filter(inWeek)), rows: swimRows },
    { label: 'Badminton', emoji: '🏸', key: 'badminton', sessions: badmintonRows.length, mins: sumMins(badmintonRows), distance: 0, accent: theme.yellow || '#eab308', weeklyMins: sumMins(badmintonRows.filter(inWeek)), rows: badmintonRows },
  ].filter((a) => a.sessions > 0 || a.mins > 0);

  const totalMins = activities.reduce((s, a) => s + a.mins, 0);
  const weeklyMix = buildWeeklySumBuckets(
    activities.flatMap((sport) => (sport.rows || []).map((row) => ({ date: row.date, minutes: row.minutes || 0 }))),
    (row) => row.minutes,
    8,
  );

  return { activities, totalMins, weeklyMix };
}

export function ActivityBreakdownCard({ name, activities = [], totalMins = 0, theme, onActivityClick }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: 12 }}>
        {name ? `${name}'s Activity Breakdown` : 'Activity Breakdown'}
      </div>
      {!activities.length ? (
        <div style={{ padding: '28px 18px', borderRadius: 20, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>
          No activity logged yet. Sync Strava to see your sports mix.
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
    </div>
  );
}
