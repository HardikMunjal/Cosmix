import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { computeRunningStats, computeWellnessStats, buildWellnessSummary } from '../lib/userInsights';

// ─── helpers ─────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtPace(minPerKm) {
  if (!minPerKm || !isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

function fmtMins(mins) {
  if (!mins || mins <= 0) return '--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── sport stats derived from raw wellness entries ────────
function computeSportStats(entries = [], minKey, distKey = null) {
  const rows = entries
    .filter((e) => Number(e[minKey] || 0) > 0)
    .map((e) => ({
      date: e.date,
      minutes: Number(e[minKey] || 0),
      distance: distKey ? Number(e[distKey] || 0) : null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!rows.length) return null;

  const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
  const totalDistance = distKey ? rows.reduce((s, r) => s + (r.distance || 0), 0) : null;
  const longestSession = [...rows].sort((a, b) => b.minutes - a.minutes)[0];
  const recent = rows.slice(0, 10);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const weeklyMins = rows.filter((r) => (r.date || '') >= weekAgoStr).reduce((s, r) => s + r.minutes, 0);

  return { rows, totalMinutes, totalDistance, longestSession, recent, weeklyMins, count: rows.length };
}

// ─── small reusable components ────────────────────────────
function HeroStat({ label, value, sub, accent, theme }) {
  return (
    <div style={{ padding: '20px 22px', borderRadius: '22px', border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, display: 'grid', gap: '6px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-18px', right: '-18px', width: '80px', height: '80px', borderRadius: '50%', background: `${accent}18`, filter: 'blur(12px)' }} />
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: '30px', fontWeight: 900, color: accent, lineHeight: 1.05 }}>{value}</div>
      {sub ? <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

function RecordCard({ label, value, detail1, detail2, accent, theme }) {
  return (
    <div style={{ padding: '18px 20px', borderRadius: '20px', border: `1px solid ${accent}44`, background: `${accent}0a`, display: 'grid', gap: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: accent, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 900, color: accent }}>{value ?? '--'}</div>
      {detail1 ? <div style={{ fontSize: '12px', color: theme.textSecondary }}>{detail1}</div> : null}
      {detail2 ? <div style={{ fontSize: '11px', color: theme.textMuted }}>{detail2}</div> : null}
    </div>
  );
}

function SectionLabel({ children, theme }) {
  return <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: '12px' }}>{children}</div>;
}

function SportSessionTable({ rows, showDistance, title, theme }) {
  if (!rows?.length) return (
    <div style={{ padding: '20px', borderRadius: '18px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: '13px' }}>No sessions logged yet.</div>
  );
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
      {title && <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: '14px', color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>{title}</div>}
      {rows.slice(0, 10).map((row, i) => (
        <div key={`${row.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: '10px', padding: '11px 18px', borderTop: i > 0 ? `1px solid ${theme.cardBorder}` : 'none', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: i === 0 ? theme.orange : theme.textMuted }}>#{i + 1}</span>
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>{fmtDate(row.date)}</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: theme.green }}>{fmtMins(row.minutes)}</span>
          {showDistance && row.distance ? <span style={{ fontSize: '11px', color: theme.textMuted }}>{row.distance} km</span> : <span />}
        </div>
      ))}
    </div>
  );
}

function WellnessRow({ entry, theme }) {
  const physPct = Math.min(100, Math.round((entry.physical / 50) * 100));
  const menPct = Math.min(100, Math.round((entry.mental / 50) * 100));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', padding: '10px 18px', alignItems: 'center', borderTop: `1px solid ${theme.cardBorder}` }}>
      <div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' }}>{fmtDate(entry.date)}</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: theme.cardBorder, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${physPct}%`, background: theme.green, borderRadius: '2px' }} />
          </div>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: theme.cardBorder, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${menPct}%`, background: theme.blue, borderRadius: '2px' }} />
          </div>
        </div>
      </div>
      <div style={{ fontSize: '20px', fontWeight: 900, color: theme.orange }}>{entry.score.toFixed(0)}</div>
    </div>
  );
}

// ─── sport tab panels ──────────────────────────────────────
function RunningTab({ runStats, wellStats, wellSummary, name, theme }) {
  const noData = !runStats || runStats.totalRuns === 0;
  if (noData) return <EmptyState sport="Running" theme={theme} />;
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div className="sport-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '14px' }}>
        <HeroStat label="Total Distance" value={`${runStats.totalDistance} km`} sub={`${runStats.totalRuns} runs`} accent={theme.blue} theme={theme} />
        <HeroStat label="Fastest Speed" value={`${runStats.fastestSpeed ?? '--'} km/h`} sub={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.distance} km · ${fmtDate(runStats.fastestSpeedRun.date)}` : null} accent={theme.green} theme={theme} />
        <HeroStat label="Average Speed" value={`${runStats.averageSpeed} km/h`} sub={runStats.averagePace ? `Pace: ${fmtPace(runStats.averagePace)}` : null} accent={theme.cyan} theme={theme} />
        <HeroStat label="Best Wellness" value={wellStats?.highestScore ? `${wellStats.highestScore.score.toFixed(0)} pts` : '--'} sub={wellStats?.highestScore ? fmtDate(wellStats.highestScore.date) : null} accent={theme.orange} theme={theme} />
      </div>

      <div>
        <SectionLabel theme={theme}>Personal Records</SectionLabel>
        <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '14px' }}>
          <RecordCard label="Fastest Speed" value={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.speed} km/h` : null} detail1={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.distance} km in ${runStats.fastestSpeedRun.time}` : null} detail2={runStats.fastestSpeedRun ? fmtDate(runStats.fastestSpeedRun.date) : null} accent={theme.green} theme={theme} />
          <RecordCard label="Longest Run" value={runStats.longestDistanceRun ? `${runStats.longestDistanceRun.distance} km` : null} detail1={runStats.longestDistanceRun ? `${runStats.longestDistanceRun.time} · ${runStats.longestDistanceRun.speed} km/h` : null} detail2={runStats.longestDistanceRun ? fmtDate(runStats.longestDistanceRun.date) : null} accent={theme.blue} theme={theme} />
          <RecordCard label="Best Pace" value={runStats.fastestSpeedRun ? fmtPace(60 / runStats.fastestSpeedRun.speed) : null} detail1={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.speed} km/h on ${fmtDate(runStats.fastestSpeedRun.date)}` : null} detail2="Pace = minutes per km" accent={theme.cyan} theme={theme} />
        </div>
      </div>

      {wellSummary && (
        <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '14px' }}>
          <RecordCard label={`${name}'s Running Streak`} value={`${wellSummary.runningStreak} day${wellSummary.runningStreak === 1 ? '' : 's'}`} detail1={wellSummary.longestRunningStreak > wellSummary.runningStreak ? `Best ever: ${wellSummary.longestRunningStreak} days` : 'All-time best!'} accent={theme.orange} theme={theme} />
          <RecordCard label="Weekly Distance" value={wellSummary.dashboardStats?.weeklyRunningKm ? `${Number(wellSummary.dashboardStats.weeklyRunningKm).toFixed(1)} km` : '--'} detail1={wellSummary.dashboardStats?.activeDays ? `${wellSummary.dashboardStats.activeDays} active days` : null} detail2={`All-time: ${runStats.totalDistance} km`} accent={theme.emerald} theme={theme} />
          <RecordCard label="Current Wellness" value={wellSummary.currentWellnessScore ? `${wellSummary.currentWellnessScore.toFixed(0)} pts` : '--'} detail1={wellSummary.weeklyAverageWellnessScore ? `7-day avg: ${wellSummary.weeklyAverageWellnessScore.toFixed(0)} pts` : null} detail2={wellSummary.maxWellnessScore ? `Peak: ${wellSummary.maxWellnessScore.toFixed(0)} pts` : null} accent={theme.purple} theme={theme} />
        </div>
      )}

      <div>
        <SectionLabel theme={theme}>Top Runs</SectionLabel>
        <div className="sport-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: '14px', color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>{name}&apos;s Fastest Runs (min 2 km)</div>
            {(runStats.topSpeeds || []).slice(0, 7).map((e, i) => (
              <div key={`${e.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: '10px', padding: '11px 18px', borderTop: i > 0 ? `1px solid ${theme.cardBorder}` : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: i === 0 ? theme.orange : theme.textMuted }}>#{i + 1}</span>
                <span style={{ fontSize: '12px', color: theme.textSecondary }}>{fmtDate(e.date)}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: theme.green }}>{e.speed} km/h</span>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>{e.distance} km</span>
              </div>
            ))}
          </div>
          <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: '14px', color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>{name}&apos;s Longest Runs</div>
            {(runStats.topDistances || []).slice(0, 7).map((e, i) => (
              <div key={`${e.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: '10px', padding: '11px 18px', borderTop: i > 0 ? `1px solid ${theme.cardBorder}` : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: i === 0 ? theme.orange : theme.textMuted }}>#{i + 1}</span>
                <span style={{ fontSize: '12px', color: theme.textSecondary }}>{fmtDate(e.date)}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: theme.blue }}>{e.distance} km</span>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>{e.speed} km/h</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleSportTab({ stats, name, sportLabel, minKey, showDistance, accent, theme }) {
  if (!stats) return <EmptyState sport={sportLabel} theme={theme} />;
  const topByTime = [...stats.rows].sort((a, b) => b.minutes - a.minutes);
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div className="sport-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '14px' }}>
        <HeroStat label="Total Sessions" value={stats.count} sub={`${fmtMins(stats.totalMinutes)} total`} accent={accent} theme={theme} />
        <HeroStat label="This Week" value={fmtMins(stats.weeklyMins)} sub="last 7 days" accent={theme.green} theme={theme} />
        <HeroStat label="Longest Session" value={fmtMins(stats.longestSession.minutes)} sub={fmtDate(stats.longestSession.date)} accent={theme.blue} theme={theme} />
        {showDistance && stats.totalDistance > 0
          ? <HeroStat label="Total Distance" value={`${stats.totalDistance.toFixed(1)} km`} sub="all-time" accent={theme.cyan} theme={theme} />
          : <HeroStat label="Avg Session" value={fmtMins(Math.round(stats.totalMinutes / stats.count))} sub="per session" accent={theme.cyan} theme={theme} />
        }
      </div>

      <div>
        <SectionLabel theme={theme}>Records</SectionLabel>
        <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '14px' }}>
          <RecordCard label="Longest Session" value={fmtMins(stats.longestSession.minutes)} detail1={fmtDate(stats.longestSession.date)} accent={accent} theme={theme} />
          <RecordCard label="Total Time" value={fmtMins(stats.totalMinutes)} detail1={`${stats.count} sessions`} accent={theme.blue} theme={theme} />
          <RecordCard label="Recent Sessions" value={`${stats.rows.slice(0, 7).length} shown`} detail1={`Latest: ${fmtDate(stats.rows[0]?.date)}`} accent={theme.green} theme={theme} />
        </div>
      </div>

      <div>
        <SectionLabel theme={theme}>{name}&apos;s Top {sportLabel} Sessions (by duration)</SectionLabel>
        <div className="sport-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <SportSessionTable rows={topByTime} showDistance={showDistance} title="Longest Sessions" theme={theme} />
          <SportSessionTable rows={stats.rows} showDistance={showDistance} title="Recent Sessions" theme={theme} />
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ wellStats, wellSummary, allSportStats, name, theme }) {
  const activities = [
    { label: 'Running', emoji: '🏃', key: 'running', sessions: allSportStats.running?.count || 0, mins: allSportStats.running?.totalMinutes || 0, accent: theme.green },
    { label: 'Badminton', emoji: '🏸', key: 'badminton', sessions: allSportStats.badminton?.count || 0, mins: allSportStats.badminton?.totalMinutes || 0, accent: theme.yellow },
    { label: 'Cycling', emoji: '🚴', key: 'cycling', sessions: allSportStats.cycling?.count || 0, mins: allSportStats.cycling?.totalMinutes || 0, accent: theme.blue },
    { label: 'Walking', emoji: '🚶', key: 'walking', sessions: allSportStats.walking?.count || 0, mins: allSportStats.walking?.totalMinutes || 0, accent: theme.cyan },
    { label: 'Swimming', emoji: '🏊', key: 'swimming', sessions: allSportStats.swimming?.count || 0, mins: allSportStats.swimming?.totalMinutes || 0, accent: theme.purple },
  ].filter((a) => a.sessions > 0);

  const totalActivityMins = activities.reduce((s, a) => s + a.mins, 0);

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Overall activity breakdown */}
      <div>
        <SectionLabel theme={theme}>{name}&apos;s Activity Breakdown</SectionLabel>
        {activities.length === 0 ? (
          <EmptyState sport="any sport" theme={theme} />
        ) : (
          <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '14px', color: theme.textHeading }}>All Sports</span>
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>{fmtMins(totalActivityMins)} total activity</span>
            </div>
            {activities.map((a) => {
              const pct = totalActivityMins > 0 ? Math.round((a.mins / totalActivityMins) * 100) : 0;
              return (
                <div key={a.key} style={{ padding: '14px 20px', borderTop: `1px solid ${theme.cardBorder}`, display: 'grid', gridTemplateColumns: '32px 1fr 80px 60px', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '20px' }}>{a.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: theme.textHeading, marginBottom: '5px' }}>{a.label}</div>
                    <div style={{ height: '5px', borderRadius: '3px', background: theme.cardBorder, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: a.accent, borderRadius: '3px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: theme.textSecondary, textAlign: 'right' }}>{a.sessions} sessions</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: a.accent, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wellness scores */}
      {wellStats?.topScores?.length > 0 && (
        <div>
          <SectionLabel theme={theme}>Top Wellness Days</SectionLabel>
          <div className="sport-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '14px', color: theme.textHeading }}>Best Recovery Days</span>
                <div style={{ display: 'flex', gap: '14px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ color: theme.green }}>■ Physical</span>
                  <span style={{ color: theme.blue }}>■ Mental</span>
                </div>
              </div>
              {wellStats.topScores.slice(0, 6).map((entry, i) => (
                <WellnessRow key={`${entry.date}-${i}`} entry={entry} theme={theme} />
              ))}
            </div>
            <div style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
              {wellSummary && [
                { label: 'Running Streak', value: `${wellSummary.runningStreak} days (best ${wellSummary.longestRunningStreak})`, accent: theme.orange },
                { label: 'Active Days This Week', value: `${wellSummary.dashboardStats?.activeDays || 0} days`, accent: theme.green },
                { label: 'Peak Wellness Score', value: wellStats.highestScore ? `${wellStats.highestScore.score.toFixed(0)} pts · ${fmtDate(wellStats.highestScore.date)}` : '--', accent: theme.purple },
                { label: 'Weekly Avg Score', value: wellStats.scoredEntries?.length ? `${(wellStats.scoredEntries.reduce((s, e) => s + e.score, 0) / wellStats.scoredEntries.length).toFixed(0)} pts` : '--', accent: theme.blue },
                { label: 'Total Wellness Entries', value: `${wellStats.entries?.length || 0} days logged`, accent: theme.cyan },
              ].map((item) => (
                <div key={item.label} style={{ padding: '16px 18px', borderRadius: '16px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: '6px' }}>{item.label}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: item.accent }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ sport, theme }) {
  return (
    <div style={{ padding: '48px 24px', borderRadius: '24px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, textAlign: 'center', color: theme.textSecondary, fontSize: '15px' }}>
      No {sport} data logged yet. Add it in the Wellness section.
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────
const SPORT_TABS = [
  { id: 'overview', label: 'Overview', emoji: '📊' },
  { id: 'running', label: 'Running', emoji: '🏃' },
  { id: 'badminton', label: 'Badminton', emoji: '🏸' },
  { id: 'cycling', label: 'Cycling', emoji: '🚴' },
  { id: 'walking', label: 'Walking', emoji: '🚶' },
  { id: 'swimming', label: 'Swimming', emoji: '🏊' },
];

export default function RunningAnalytics() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('running');

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  const runStats = useMemo(() => (user?.id ? computeRunningStats(user.id) : null), [user?.id]);
  const wellStats = useMemo(() => (user?.id ? computeWellnessStats(user.id) : null), [user?.id]);
  const wellSummary = useMemo(() => (user?.id ? buildWellnessSummary(user.id) : null), [user?.id]);

  const entries = useMemo(() => wellSummary?.entries || [], [wellSummary]);

  const allSportStats = useMemo(() => ({
    running: computeSportStats(entries, 'runningMinutes', 'runningDistanceKm'),
    badminton: computeSportStats(entries, 'badmintonMinutes'),
    cycling: computeSportStats(entries, 'cyclingMinutes'),
    walking: computeSportStats(entries, 'walkingMinutes', 'walkingDistanceKm'),
    swimming: computeSportStats(entries, 'swimmingMinutes'),
  }), [entries]);

  const name = user?.name || user?.username || 'Athlete';

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, padding: '24px', fontFamily: theme.font }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        @media (max-width: 900px) {
          .sport-4col { grid-template-columns: 1fr 1fr !important; }
          .sport-3col { grid-template-columns: 1fr 1fr !important; }
          .sport-2col { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .sport-4col { grid-template-columns: 1fr !important; }
          .sport-3col { grid-template-columns: 1fr !important; }
          .sport-tab-strip { flex-wrap: nowrap !important; overflow-x: auto !important; padding-bottom: 4px !important; }
          .sport-tab-strip button { flex: 0 0 auto; min-width: max-content; }
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '20px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', padding: '22px 24px', borderRadius: '24px', background: theme.panelBg || theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.textMuted, marginBottom: '6px' }}>Fitness Analytics</div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: theme.textHeading, lineHeight: 1.1 }}>{name}&apos;s Sports Stats</h1>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: theme.textSecondary }}>
              {runStats?.totalRuns || 0} runs · {allSportStats.badminton?.count || 0} badminton · {allSportStats.cycling?.count || 0} cycling sessions
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/leaderboard')} style={{ background: theme.btnSecondaryBg || theme.cardBg, color: theme.btnSecondaryText || theme.textPrimary, border: `1px solid ${theme.cardBorder}`, borderRadius: '12px', padding: '9px 15px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Leaderboard</button>
            <button onClick={() => router.push('/wellness')} style={{ background: theme.btnSecondaryBg || theme.cardBg, color: theme.btnSecondaryText || theme.textPrimary, border: `1px solid ${theme.cardBorder}`, borderRadius: '12px', padding: '9px 15px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Log Activity</button>
            <button onClick={() => router.push('/dashboard')} style={{ background: theme.orange, color: '#fff', border: 'none', borderRadius: '12px', padding: '9px 15px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Dashboard</button>
          </div>
        </div>

        {/* ── Sport Tabs ── */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} className="sport-tab-strip">
          {SPORT_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 18px', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                  border: isActive ? `1px solid ${theme.orange}` : `1px solid ${theme.cardBorder}`,
                  background: isActive ? `${theme.orange}18` : theme.cardBg,
                  color: isActive ? theme.orange : theme.textSecondary,
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.15s',
                }}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ── */}
        {activeTab === 'overview' && (
          <OverviewTab wellStats={wellStats} wellSummary={wellSummary} allSportStats={allSportStats} name={name} theme={theme} />
        )}
        {activeTab === 'running' && (
          <RunningTab runStats={runStats} wellStats={wellStats} wellSummary={wellSummary} name={name} theme={theme} />
        )}
        {activeTab === 'badminton' && (
          <SimpleSportTab stats={allSportStats.badminton} name={name} sportLabel="Badminton" minKey="badmintonMinutes" showDistance={false} accent={theme.yellow || '#eab308'} theme={theme} />
        )}
        {activeTab === 'cycling' && (
          <SimpleSportTab stats={allSportStats.cycling} name={name} sportLabel="Cycling" minKey="cyclingMinutes" showDistance={false} accent={theme.blue} theme={theme} />
        )}
        {activeTab === 'walking' && (
          <SimpleSportTab stats={allSportStats.walking} name={name} sportLabel="Walking" minKey="walkingMinutes" showDistance={true} accent={theme.cyan} theme={theme} />
        )}
        {activeTab === 'swimming' && (
          <SimpleSportTab stats={allSportStats.swimming} name={name} sportLabel="Swimming" minKey="swimmingMinutes" showDistance={false} accent={theme.purple} theme={theme} />
        )}
      </div>
    </div>
  );
}
