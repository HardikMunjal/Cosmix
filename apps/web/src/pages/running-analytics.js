import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { MarathonGoalModal, MarathonRaceHub } from '../lib/MarathonRaceHub';
import { MobileBottomNav } from '../lib/MobileNav';
import { useTheme } from '../lib/ThemePicker';
import { computeRunningStats, computeWellnessStats, buildWellnessSummary } from '../lib/userInsights';
import { formatStravaSyncMessage, runStravaAutoSync } from '../lib/stravaAutoSync';
import {
  buildRunningRows,
  computeRunLeaderboards,
  computeShoeStats,
  createRunningShoeId,
  getRunningShoeLabel,
  getShoeColor,
  isWellnessApiReady,
  loadRunningShoesFromServer,
  readRunningShoes,
  saveRunningShoesLocal,
  syncRunningShoesToServer,
  wellnessApiUrl,
} from '../lib/runningShoes';
import {
  DepthMetric,
  RunTrendChart,
  RunLeaderboard,
  TopDistanceRuns,
  buildRunTrendBuckets,
  DepthHBars,
  ShoeMixChart,
  CHART_SOFT,
} from '../lib/RunningModernCharts';
import { loadRunningSurfaceId, saveRunningSurfaceId, mergeRunningSurface } from '../lib/runningThemes';
import { buildMarathonReadiness, loadMarathonGoal } from '../lib/marathonReadiness';
import { buildTrainingTip } from '../lib/trainingTip';
import { CoachBotCard } from '../lib/CoachBotCard';
import Link from 'next/link';
import { StravaRunExplorer } from '../lib/StravaRunExplorer';
import { detectNewPersonalRecords } from '../lib/personalRecords';
import { PersonalRecordModal, ShareRunButton } from '../lib/PersonalRecordModal';

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
function buildHeartRateDashboard(runRows = [], stravaInsights = null) {
  const hrRuns = (runRows || [])
    .filter((row) => Number(row.avgHeartrate || row.avgHeartRate || 0) > 0 && Number(row.distance || 0) > 0)
    .map((row) => ({
      date: row.date,
      name: row.name || 'Run',
      distance: Number(row.distance || 0),
      minutes: Number(row.minutes || 0),
      avgHr: Number(row.avgHeartrate || row.avgHeartRate || 0),
      maxHr: Number(row.maxHeartrate || row.maxHeartRate || 0) || null,
      pace: row.distance > 0 ? row.minutes / row.distance : null,
      stravaId: Number(row.stravaId || row.id || 0) || null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!hrRuns.length && !stravaInsights?.avgHeartRate) {
    return null;
  }

  const avgHr = hrRuns.length
    ? Math.round(hrRuns.reduce((sum, run) => sum + run.avgHr, 0) / hrRuns.length)
    : Number(stravaInsights?.avgHeartRate || 0) || null;
  const maxHr = hrRuns.reduce((best, run) => Math.max(best, Number(run.maxHr || run.avgHr || 0)), 0)
    || Number(stravaInsights?.maxHeartRate || 0)
    || null;
  const latest = hrRuns[0] || null;
  const previous = hrRuns[1] || null;
  const delta = latest && previous ? latest.avgHr - previous.avgHr : null;

  return {
    hrRuns,
    avgHr,
    maxHr,
    latest,
    delta,
    runCount: hrRuns.length || Number(stravaInsights?.heartRateZoneRuns || 0) || 0,
    zones: stravaInsights?.heartRateZones || [],
    dominantZone: stravaInsights?.dominantHeartRateZone || null,
  };
}

function HeartRateSparkline({ runs, theme }) {
  const points = [...(runs || [])].slice(0, 30).reverse();
  if (points.length < 2) return null;
  const values = points.map((run) => run.avgHr);
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;
  const W = 420;
  const H = 110;
  const step = W / Math.max(1, points.length - 1);
  const coords = points.map((run, index) => {
    const x = index * step;
    const y = H - ((run.avgHr - min) / Math.max(1, max - min)) * (H - 12) - 6;
    return `${x},${y}`;
  }).join(' ');
  const avgLine = values.reduce((a, b) => a + b, 0) / values.length;
  const avgY = H - ((avgLine - min) / Math.max(1, max - min)) * (H - 12) - 6;

  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: 8 }}>
        Average heart rate · last {points.length} runs
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: H + 18 }}>
        <line x1="0" y1={avgY} x2={W} y2={avgY} stroke={`${theme.cardBorder}`} strokeWidth="1" strokeDasharray="4 4" />
        <polyline fill="none" stroke="#f43f5e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={coords} />
        {points.map((run, index) => {
          const x = index * step;
          const y = H - ((run.avgHr - min) / Math.max(1, max - min)) * (H - 12) - 6;
          return <circle key={`${run.date}-${index}`} cx={x} cy={y} r="3.5" fill="#fb7185" />;
        })}
        <text x="0" y={H + 14} fill={theme.textMuted} fontSize="9">{fmtDate(points[0].date)}</text>
        <text x={W} y={H + 14} textAnchor="end" fill={theme.textMuted} fontSize="9">{fmtDate(points[points.length - 1].date)}</text>
      </svg>
      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
        Season avg {Math.round(avgLine)} bpm · tap a run below for map, splits & HR graph
      </div>
    </div>
  );
}

function HeartRateDashboard({ hrDashboard, theme, onOpenRun }) {
  if (!hrDashboard) {
    return (
      <div style={{ borderRadius: 14, border: `1px dashed ${theme.cardBorder}`, padding: 12, fontSize: 12, color: theme.textMuted }}>
        No heart-rate runs yet. After a Strava sync with HR enabled, avg/max BPM and zones show up here.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="run-dash-mini-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        <MiniStat label="Avg HR" value={hrDashboard.avgHr ? `${hrDashboard.avgHr} bpm` : '--'} sub={`${hrDashboard.runCount} HR run${hrDashboard.runCount === 1 ? '' : 's'}`} accent="#f43f5e" theme={theme} />
        <MiniStat label="Max HR" value={hrDashboard.maxHr ? `${hrDashboard.maxHr} bpm` : '--'} sub="peak across synced runs" accent="#fb7185" theme={theme} />
        <MiniStat
          label="Latest run HR"
          value={hrDashboard.latest ? `${hrDashboard.latest.avgHr} bpm` : '--'}
          sub={hrDashboard.latest ? `${fmtDate(hrDashboard.latest.date)} · ${hrDashboard.latest.distance} km` : 'waiting for sync'}
          accent="#e11d48"
          theme={theme}
        />
        <MiniStat
          label="Vs previous"
          value={hrDashboard.delta == null ? '--' : `${hrDashboard.delta > 0 ? '+' : ''}${hrDashboard.delta} bpm`}
          sub={hrDashboard.dominantZone ? `most time Z${hrDashboard.dominantZone.zone}` : 'avg HR change'}
          accent={hrDashboard.delta == null ? theme.textMuted : (hrDashboard.delta > 0 ? '#f59e0b' : '#22c55e')}
          theme={theme}
        />
      </div>
      {(hrDashboard.zones || []).length ? (
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>Time in HR zones</div>
          {hrDashboard.zones.map((zone) => (
            <div key={`dash-hr-zone-${zone.zone}`} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 64px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{zone.label}</span>
              <div style={{ height: 10, borderRadius: 999, background: `${theme.cardBorder}`, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, Number(zone.percent || 0))}%`,
                  height: '100%',
                  background: ['#94a3b8', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'][Math.max(0, Number(zone.zone || 1) - 1)] || '#fb7185',
                }}
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>{zone.percent}%</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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

function PaceTrendChart({ runRows, theme }) {
  const paceData = [...(runRows || [])]
    .filter((r) => r.distance > 0 && r.minutes > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-20)
    .map((r) => ({ date: r.date, pace: r.minutes / r.distance }));
  if (paceData.length < 2) return null;
  const W = 400, H = 100;
  const minPace = Math.min(...paceData.map((d) => d.pace));
  const maxPace = Math.max(...paceData.map((d) => d.pace));
  const range = Math.max(0.5, maxPace - minPace);
  const pts = paceData.map((d, i) => {
    const x = (i / (paceData.length - 1)) * W;
    const y = H - ((d.pace - minPace) / range) * (H - 20) - 10;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', padding: '16px 20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: '10px' }}>Pace Trend — min/km (lower = faster)</div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', height: H + 20, minWidth: 200 }}>
          <defs>
            <linearGradient id="pace-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.cyan} stopOpacity="0.25" />
              <stop offset="100%" stopColor={theme.cyan} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon fill="url(#pace-fill)" points={fillPts} />
          <polyline fill="none" stroke={theme.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
          {paceData.map((d, i) => {
            const x = (i / (paceData.length - 1)) * W;
            const y = H - ((d.pace - minPace) / range) * (H - 20) - 10;
            const showLabel = i === 0 || i === paceData.length - 1 || i % Math.max(1, Math.floor(paceData.length / 5)) === 0;
            return (
              <g key={d.date}>
                <circle cx={x} cy={y} r="3.5" fill={theme.cyan} />
                {showLabel && <text x={x} y={H + 16} textAnchor="middle" fill={theme.textMuted} fontSize="9">{d.date.slice(5)}</text>}
                {showLabel && <text x={x} y={y - 6} textAnchor="middle" fill={theme.cyan} fontSize="9" fontWeight="700">{fmtPace(d.pace)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Last {paceData.length} runs</div>
    </div>
  );
}

function buildRunningInsights(runRows = []) {
  const toDay = (value) => String(value || '').slice(0, 10);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const inLastDays = (dateStr, days) => {
    const day = toDay(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const t = new Date(`${day}T12:00:00`).getTime();
    const start = startOfToday.getTime() - ((days - 1) * 86400000);
    const end = startOfToday.getTime() + 86400000 - 1;
    return t >= start && t <= end;
  };

  const rows = [...runRows]
    .filter((r) => Number(r.distance || 0) > 0 && Number(r.minutes || 0) > 0)
    .map((r) => ({
      ...r,
      date: toDay(r.date),
      distance: Number(r.distance),
      minutes: Number(r.minutes),
      pace: Number(r.minutes) / Number(r.distance),
      speed: Number(r.distance) / (Number(r.minutes) / 60),
      key: r.stravaId || `${toDay(r.date)}-${Number(r.distance).toFixed(2)}-${Number(r.minutes)}`,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // Deduplicate accidental double imports of the same Strava activity.
  const seen = new Set();
  const uniqueRows = rows.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });

  const last7 = uniqueRows.filter((r) => inLastDays(r.date, 7));
  const last30 = uniqueRows.filter((r) => inLastDays(r.date, 30));

  const avgPace = (list) => (list.length ? list.reduce((s, r) => s + r.pace, 0) / list.length : null);
  const totalKm = (list) => list.reduce((s, r) => s + r.distance, 0);

  const weekdayKm = Array.from({ length: 7 }, () => 0);
  const weekdayRuns = Array.from({ length: 7 }, () => 0);
  uniqueRows.forEach((r) => {
    const dow = new Date(`${r.date}T12:00:00`).getDay();
    weekdayKm[dow] += r.distance;
    weekdayRuns[dow] += 1;
  });
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const monthMap = {};
  uniqueRows.forEach((r) => {
    const key = String(r.date).slice(0, 7);
    if (!monthMap[key]) monthMap[key] = { month: key, km: 0, runs: 0, longest: 0 };
    monthMap[key].km += r.distance;
    monthMap[key].runs += 1;
    monthMap[key].longest = Math.max(monthMap[key].longest, r.distance);
  });
  const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  const recentRuns = uniqueRows.slice(0, 8);

  return {
    avgPace7: avgPace(last7),
    avgPace30: avgPace(last30),
    km7: totalKm(last7),
    km30: totalKm(last30),
    runs7: last7.length,
    runs30: last30.length,
    weekdayKm,
    weekdayRuns,
    weekdayLabels,
    months,
    recentRuns,
  };
}

function MiniStat({ label, value, sub, accent, theme }) {
  return (
    <div style={{
      padding: '14px 14px 12px',
      borderRadius: 16,
      background: `linear-gradient(145deg, ${accent}18 0%, ${theme.cardBg} 55%)`,
      border: `1px solid ${accent}44`,
      boxShadow: `0 10px 24px ${accent}14, inset 0 1px 0 rgba(255,255,255,0.06)`,
      transform: 'perspective(800px) rotateX(2deg)',
      transformOrigin: 'center top',
    }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: accent, marginTop: 6, letterSpacing: '-0.02em' }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

function DashPanel({ title, subtitle, theme, children, accent }) {
  return (
    <div style={{
      background: `linear-gradient(165deg, ${theme.cardBg} 0%, ${theme.pageBgSolid || theme.cardBg} 100%)`,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: 20,
      padding: 14,
      display: 'grid',
      gap: 10,
      boxShadow: `0 16px 40px rgba(0,0,0,0.18), 0 1px 0 ${accent || theme.orange}33 inset`,
      transform: 'perspective(900px) rotateX(1.5deg)',
      transformOrigin: 'center top',
    }}
    >
      {(title || subtitle) ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {title ? <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div> : <span />}
          {subtitle ? <div style={{ fontSize: 11, color: theme.textMuted }}>{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function RecentRunsChart({ runs, theme }) {
  if (!runs?.length) return null;
  const ordered = [...runs].reverse();
  const maxKm = Math.max(...ordered.map((r) => r.distance), 1);
  const W = 360;
  const H = 88;
  const colW = W / ordered.length;
  const barW = Math.max(10, colW * 0.55);
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: 10 }}>Recent runs — distance (km)</div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: H + 18 }}>
        {ordered.map((r, i) => {
          const cx = i * colW + colW / 2;
          const barH = Math.max(4, (r.distance / maxKm) * (H - 8));
          const y = H - barH;
          return (
            <g key={r.date}>
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="4" fill={theme.green} opacity={0.85} />
              <text x={cx} y={y - 3} textAnchor="middle" fill={theme.green} fontSize="8" fontWeight="700">{r.distance.toFixed(1)}</text>
              <text x={cx} y={H + 12} textAnchor="middle" fill={theme.textMuted} fontSize="7">{String(r.date).slice(5)}</text>
            </g>
          );
        })}
        <line x1="0" x2={W} y1={H} y2={H} stroke={theme.cardBorder} />
      </svg>
    </div>
  );
}

function MonthlyVolumeChart({ months, theme }) {
  if (!months?.length) return null;
  const maxKm = Math.max(...months.map((m) => m.km), 1);
  const W = 360;
  const H = 88;
  const colW = W / months.length;
  const barW = Math.max(14, colW * 0.5);
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: 10 }}>Monthly volume — km</div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: H + 18 }}>
        {months.map((m, i) => {
          const cx = i * colW + colW / 2;
          const barH = Math.max(4, (m.km / maxKm) * (H - 8));
          const y = H - barH;
          return (
            <g key={m.month}>
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="4" fill={theme.blue} opacity={i === months.length - 1 ? 1 : 0.7} />
              <text x={cx} y={y - 3} textAnchor="middle" fill={theme.blue} fontSize="8" fontWeight="700">{m.km.toFixed(0)}</text>
              <text x={cx} y={H + 12} textAnchor="middle" fill={theme.textMuted} fontSize="7">{m.month.slice(5)}</text>
            </g>
          );
        })}
        <line x1="0" x2={W} y1={H} y2={H} stroke={theme.cardBorder} />
      </svg>
    </div>
  );
}

function LongRunTrendChart({ months, theme }) {
  if (!months?.length) return null;
  const maxLong = Math.max(...months.map((m) => m.longest), 1);
  const W = 360;
  const H = 88;
  const pts = months.map((m, i) => {
    const x = months.length === 1 ? W / 2 : (i / (months.length - 1)) * W;
    const y = H - (m.longest / maxLong) * (H - 16) - 8;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: 10 }}>Longest run per month — km</div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: H + 18 }}>
        <polyline fill="none" stroke={theme.purple} strokeWidth="2.5" points={pts} />
        {months.map((m, i) => {
          const x = months.length === 1 ? W / 2 : (i / (months.length - 1)) * W;
          const y = H - (m.longest / maxLong) * (H - 16) - 8;
          return (
            <g key={m.month}>
              <circle cx={x} cy={y} r="4" fill={theme.purple} />
              <text x={x} y={H + 12} textAnchor="middle" fill={theme.textMuted} fontSize="7">{m.month.slice(5)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WeekdayPatternChart({ weekdayKm, weekdayLabels, theme }) {
  const max = Math.max(...weekdayKm, 0.1);
  const W = 280;
  const H = 72;
  const colW = W / 7;
  const barW = colW * 0.55;
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: 10 }}>Runs by weekday — total km</div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', height: H + 16 }}>
        {weekdayLabels.map((label, i) => {
          const cx = i * colW + colW / 2;
          const barH = Math.max(2, (weekdayKm[i] / max) * (H - 4));
          const y = H - barH;
          return (
            <g key={label}>
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="3" fill={theme.orange} opacity={weekdayKm[i] > 0 ? 0.9 : 0.2} />
              <text x={cx} y={H + 11} textAnchor="middle" fill={theme.textMuted} fontSize="8">{label}</text>
            </g>
          );
        })}
        <line x1="0" x2={W} y1={H} y2={H} stroke={theme.cardBorder} />
      </svg>
    </div>
  );
}

function SpeedTrendChart({ runRows, theme }) {
  const data = [...(runRows || [])]
    .filter((r) => r.distance > 0 && r.minutes > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-12)
    .map((r) => ({ date: r.date, speed: r.distance / (r.minutes / 60) }));
  if (data.length < 2) return null;
  const W = 360;
  const H = 88;
  const minS = Math.min(...data.map((d) => d.speed));
  const maxS = Math.max(...data.map((d) => d.speed));
  const range = Math.max(0.5, maxS - minS);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d.speed - minS) / range) * (H - 16) - 8;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: 10 }}>Speed trend — km/h</div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: H + 18 }}>
        <polyline fill="none" stroke={theme.green} strokeWidth="2.5" points={pts} />
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * W;
          const y = H - ((d.speed - minS) / range) * (H - 16) - 8;
          return <circle key={d.date} cx={x} cy={y} r="3.5" fill={theme.green} />;
        })}
      </svg>
    </div>
  );
}

function WeeklyMileageChart({ runRows, theme }) {
  const weekMap = {};
  (runRows || []).forEach((r) => {
    const d = new Date(`${r.date}T00:00:00`);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = { week: key, km: 0, sessions: 0 };
    weekMap[key].km += Number(r.distance || 0);
    weekMap[key].sessions += 1;
  });
  const weeks = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week)).slice(-10);
  if (weeks.length === 0) return null;
  const maxKm = Math.max(...weeks.map((w) => w.km), 1);
  const W = 420, H = 100;
  const colW = W / weeks.length;
  const barW = Math.max(12, colW * 0.55);
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', padding: '16px 20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: '10px' }}>Weekly Distance — km per week</div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', height: H + 22, minWidth: 180 }}>
          {weeks.map((w, i) => {
            const cx = i * colW + colW / 2;
            const barH = Math.max(4, (w.km / maxKm) * (H - 12));
            const y = H - barH;
            const isLatest = i === weeks.length - 1;
            const fill = isLatest ? theme.orange : theme.blue;
            return (
              <g key={w.week}>
                <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="5" fill={fill} opacity={isLatest ? 1 : 0.65} />
                <text x={cx} y={y - 4} textAnchor="middle" fill={fill} fontSize="9" fontWeight="800">{w.km.toFixed(1)}</text>
                <text x={cx} y={H + 16} textAnchor="middle" fill={theme.textMuted} fontSize="8">{w.week.slice(5)}</text>
              </g>
            );
          })}
          <line x1="0" x2={W} y1={H} y2={H} stroke={theme.cardBorder} strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

function RunningShoesPanel({
  userId,
  shoes,
  onChange,
  theme,
  importedRuns = [],
  onAssignShoe,
  onDeleteRun,
  savingShoeId,
  deletingRunId,
  assignError,
  forceEditPastRuns = false,
}) {
  const [name, setName] = useState('');
  const [editPastRuns, setEditPastRuns] = useState(Boolean(forceEditPastRuns));
  const activeShoes = (shoes || []).filter((shoe) => !shoe.retired);
  const stravaRuns = (importedRuns || []).filter((run) => run.stravaId).slice(0, 20);
  const needsShoe = stravaRuns.filter((run) => !run.shoeId || !activeShoes.some((shoe) => shoe.id === run.shoeId));
  const assignedCount = stravaRuns.filter((run) => run.shoeId && activeShoes.some((shoe) => shoe.id === run.shoeId)).length;
  const showAssignList = needsShoe.length > 0 || editPastRuns || forceEditPastRuns;
  const runsToShow = (needsShoe.length && !editPastRuns && !forceEditPastRuns ? needsShoe : stravaRuns).slice(0, 12);
  const inputBg = theme.inputBg || theme.panelBg || theme.cardBg;
  const inputBorder = theme.inputBorder || theme.cardBorder;
  const isDark = Boolean(theme.pageBgSolid && (theme.pageBgSolid.startsWith('#0') || theme.pageBgSolid.startsWith('#1')));

  useEffect(() => {
    if (forceEditPastRuns) setEditPastRuns(true);
  }, [forceEditPastRuns]);

  function handleAdd(event) {
    if (event?.preventDefault) event.preventDefault();
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return;
    const next = [
      ...shoes,
      {
        id: createRunningShoeId(),
        name: trimmedName,
        brand: '',
        createdAt: new Date().toISOString(),
        retired: false,
      },
    ];
    const saved = saveRunningShoesLocal(userId, next);
    onChange(saved);
    void syncRunningShoesToServer(userId, saved, { immediate: true });
    setName('');
  }

  function handleRemove(shoeId) {
    const next = shoes.filter((shoe) => shoe.id !== shoeId);
    const saved = saveRunningShoesLocal(userId, next);
    onChange(saved);
    void syncRunningShoesToServer(userId, saved, { immediate: true });
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Nike Pegasus 40"
          aria-label="Shoe name"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '10px 12px',
            borderRadius: 12,
            border: `1px solid ${inputBorder}`,
            background: inputBg,
            color: theme.textHeading,
            fontSize: 14,
            colorScheme: isDark ? 'dark' : 'light',
          }}
        />
        <button
          type="submit"
          disabled={!String(name || '').trim()}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '10px 16px',
            background: theme.orange,
            color: '#fff',
            fontWeight: 800,
            cursor: String(name || '').trim() ? 'pointer' : 'default',
            opacity: String(name || '').trim() ? 1 : 0.55,
            whiteSpace: 'nowrap',
          }}
        >
          Add
        </button>
      </form>

      {activeShoes.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {activeShoes.map((shoe) => {
            const shoeColor = getShoeColor(shoe.id, theme.orange);
            return (
            <span
              key={shoe.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px 6px 10px',
                borderRadius: 999,
                border: `1px solid ${shoeColor}66`,
                background: `${shoeColor}14`,
                fontSize: 13,
                fontWeight: 700,
                color: theme.textHeading,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 999, background: shoeColor, flexShrink: 0 }} />
              {getRunningShoeLabel(shoe)}
              <button
                type="button"
                onClick={() => handleRemove(shoe.id)}
                aria-label={`Remove ${getRunningShoeLabel(shoe)}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: '2px 4px',
                }}
              >
                ×
              </button>
            </span>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: theme.textMuted }}>Type a shoe name and hit Add.</div>
      )}

      {stravaRuns.length ? (
        <div style={{ display: 'grid', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.cardBorder}` }}>
          {needsShoe.length ? (
            <div style={{ fontSize: 12, color: theme.orange, fontWeight: 700 }}>
              {needsShoe.length} recent run{needsShoe.length === 1 ? '' : 's'} need a shoe — pick from the dropdown
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                {assignedCount} Strava run{assignedCount === 1 ? '' : 's'} tagged
              </div>
              <button
                type="button"
                onClick={() => setEditPastRuns((open) => !open)}
                style={{
                  border: `1px solid ${theme.cardBorder}`,
                  background: 'transparent',
                  color: theme.textMuted,
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {editPastRuns ? 'Hide past runs' : 'Edit past runs'}
              </button>
            </div>
          )}
          {assignError ? (
            <div style={{ fontSize: 12, color: theme.red || '#ef4444', fontWeight: 600 }}>{assignError}</div>
          ) : null}
          {showAssignList && runsToShow.length && !activeShoes.length ? (
            <div style={{ fontSize: 12, color: theme.textMuted }}>Add a shoe above, then pick it for each run.</div>
          ) : null}
          {showAssignList ? runsToShow.map((run) => {
            const busy = savingShoeId === run.stravaId || deletingRunId === run.stravaId;
            return (
              <div
                key={run.stravaId}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: '12px',
                  borderRadius: 14,
                  border: `1px solid ${theme.cardBorder}`,
                  background: inputBg,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>
                      {fmtDate(run.date)} · {run.distance} km
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {run.shoeId
                        ? `Shoe: ${getRunningShoeLabel(activeShoes.find((s) => s.id === run.shoeId) || { name: 'Unknown' })}`
                        : 'No shoe yet — choose one below'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Remove this run from Cosmix?\n${fmtDate(run.date)} · ${run.distance} km`)) return;
                      onDeleteRun?.(run.stravaId);
                    }}
                    style={{
                      border: `1px solid ${theme.red || '#fb7185'}55`,
                      background: `${theme.red || '#fb7185'}18`,
                      color: theme.red || '#fb7185',
                      borderRadius: 10,
                      padding: '7px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {deletingRunId === run.stravaId ? '…' : 'Delete'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeShoes.length ? (
                    <select
                      value={run.shoeId || ''}
                      disabled={busy}
                      aria-label={`Shoe for ${fmtDate(run.date)}`}
                      onChange={(e) => onAssignShoe?.(run.stravaId, e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 140,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: `1px solid ${inputBorder}`,
                        background: inputBg,
                        color: theme.textHeading,
                        fontSize: 13,
                        fontWeight: 700,
                        colorScheme: isDark ? 'dark' : 'light',
                        cursor: busy ? 'default' : 'pointer',
                      }}
                    >
                      <option value="" style={{ background: inputBg, color: theme.textHeading }}>No shoe</option>
                      {activeShoes.map((shoe) => (
                        <option
                          key={shoe.id}
                          value={shoe.id}
                          style={{ background: inputBg, color: theme.textHeading }}
                        >
                          {getRunningShoeLabel(shoe)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            );
          }) : null}
        </div>
      ) : null}
    </div>
  );
}

function ShoeKmChart({ shoeStats, theme }) {
  if (!shoeStats?.length) return null;
  const maxKm = Math.max(...shoeStats.map((row) => row.totalKm), 1);
  const W = 420;
  const H = 110;
  const colW = W / shoeStats.length;
  const barW = Math.max(18, colW * 0.55);
  const colors = [theme.orange, theme.blue, theme.green, theme.cyan, theme.purple];

  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: 10 }}>Distance by shoe — km</div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H + 34}`} style={{ width: '100%', height: H + 34, minWidth: 220 }}>
          {shoeStats.map((row, i) => {
            const cx = i * colW + colW / 2;
            const barH = Math.max(6, (row.totalKm / maxKm) * (H - 12));
            const y = H - barH;
            const fill = colors[i % colors.length];
            return (
              <g key={row.shoeId || row.label}>
                <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="6" fill={fill} opacity={0.85} />
                <text x={cx} y={y - 5} textAnchor="middle" fill={fill} fontSize="9" fontWeight="800">{row.totalKm}</text>
                <text x={cx} y={H + 14} textAnchor="middle" fill={theme.textMuted} fontSize="8">{row.name.slice(0, 10)}</text>
              </g>
            );
          })}
          <line x1="0" x2={W} y1={H} y2={H} stroke={theme.cardBorder} />
        </svg>
      </div>
    </div>
  );
}

function ShoeLeaderBars({ title, items = [], theme, accent, valueFmt }) {
  if (!items.length) {
    return (
      <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: tag more runs with shoes to unlock this chart.
      </div>
    );
  }
  const max = Math.max(...items.map((item) => Math.abs(Number(item.value) || 0)), 0.01);
  return (
    <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.textMuted }}>{title}</div>
      {items.map((item, index) => {
        const value = Number(item.value) || 0;
        const width = Math.max(6, (Math.abs(value) / max) * 100);
        return (
          <div key={`${title}-${item.id || item.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 8, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textHeading }}>{item.label}</div>
              {item.sub ? <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{item.sub}</div> : null}
              <div style={{ height: 8, borderRadius: 99, background: theme.cardBorder, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: `${width}%`, height: '100%', background: accent || theme.blue, borderRadius: 99 }} />
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: accent || theme.textHeading, textAlign: 'right' }}>
              {valueFmt ? valueFmt(value) : value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShoeStatsSection({ entries, shoes, theme, onAssignShoes }) {
  const shoeStats = useMemo(() => computeShoeStats(entries, shoes), [entries, shoes]);
  const topDistance = useMemo(() => computeRunLeaderboards(entries, shoes, 5).topDistance, [entries, shoes]);
  const untagged = shoeStats.filter((row) => !row.shoeId);
  const unknown = shoeStats.filter((row) => row.shoeId && !(shoes || []).some((shoe) => shoe.id === row.shoeId));
  if (!shoeStats.length) {
    return (
      <div style={{ padding: 16, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 13 }}>
        Log runs and tag them with a shoe to fill distance/pace here. Your shoe list always shows above even at 0 km.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {(untagged.length || unknown.length || !(shoes || []).length) ? (
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          padding: '12px 14px',
          borderRadius: 14,
          border: `1px solid ${theme.cardBorder}`,
          background: theme.pageBgSolid || theme.cardBg,
        }}
        >
          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>
            This chart is stats only. Add shoes and tag runs in the <strong style={{ color: theme.textHeading }}>Shoes</strong> section above
            {untagged.length ? ' — untagged km stays here until you assign a shoe.' : '.'}
          </div>
          <button
            type="button"
            onClick={() => onAssignShoes?.()}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '10px 14px',
              background: theme.orange,
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Assign shoes to runs
          </button>
        </div>
      ) : null}
      <ShoeMixChart shoeStats={shoeStats.filter((row) => row.shoeId)} theme={theme} />
      <TopDistanceRuns
        title="Top distance runs"
        rows={topDistance}
        theme={theme}
        limit={5}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, minWidth: 0 }}>
        <DepthHBars
          title="Runs per shoe"
          theme={theme}
          accent={theme.blue}
          items={shoeStats.filter((r) => r.shoeId).slice(0, 6).map((r) => ({
            label: String(r.label || r.name || 'Shoe').slice(0, 18),
            value: r.runs,
            shoeId: r.shoeId,
            color: getShoeColor(r.shoeId, theme.blue),
          }))}
        />
      </div>
      <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, minWidth: 0 }}>
        {shoeStats.filter((row) => row.shoeId).map((row) => {
          const shoeColor = getShoeColor(row.shoeId, theme.orange);
          return (
          <div key={row.shoeId || row.label} style={{
            padding: '14px 16px',
            borderRadius: 18,
            border: `1px solid ${shoeColor}55`,
            borderLeft: `4px solid ${shoeColor}`,
            background: theme.cardBg,
            boxShadow: theme.chartDepth,
            overflow: 'hidden',
            minWidth: 0,
          }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: shoeColor, flexShrink: 0 }} />
              {row.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, fontSize: 12 }}>
              <div><span style={{ color: theme.textMuted }}>Runs</span><div style={{ fontWeight: 800, color: shoeColor }}>{row.runs}</div></div>
              <div><span style={{ color: theme.textMuted }}>Total km</span><div style={{ fontWeight: 800, color: shoeColor }}>{row.totalKm}</div></div>
              <div><span style={{ color: theme.textMuted }}>Avg distance</span><div style={{ fontWeight: 800, color: theme.textHeading }}>{row.avgDistance} km</div></div>
              <div><span style={{ color: theme.textMuted }}>Avg pace</span><div style={{ fontWeight: 800, color: theme.textHeading }}>{row.avgPace ? fmtPace(row.avgPace) : '--'}</div></div>
              <div><span style={{ color: theme.textMuted }}>Avg speed</span><div style={{ fontWeight: 800, color: theme.textHeading }}>{row.avgSpeed} km/h</div></div>
              <div><span style={{ color: theme.textMuted }}>Longest run</span><div style={{ fontWeight: 800, color: theme.textHeading }}>{row.longestRunKm} km</div></div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function ZonePercentBars({ zones = [], theme, colors }) {
  const palette = colors || ['#94a3b8', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];
  if (!zones.length) {
    return <div style={{ fontSize: 12, color: theme.textMuted }}>No zone data for this selection</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {zones.map((zone) => (
        <div key={`z-${zone.zone || zone.label}`} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 64px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{zone.label || `Z${zone.zone}`}</span>
          <div style={{ height: 10, borderRadius: 999, background: `${theme.cardBorder}`, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, Number(zone.percent || 0))}%`,
              height: '100%',
              background: palette[Math.max(0, Number(zone.zone || 1) - 1)] || palette[0],
            }}
            />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>
            {zone.percent != null ? `${zone.percent}%` : (zone.count ?? '--')}
          </span>
        </div>
      ))}
    </div>
  );
}

function PaceMinuteBars({ buckets = [], theme, denominator }) {
  const max = Math.max(1, Number(denominator) || Math.max(...buckets.map((b) => Number(b.count || b.percent || 0)), 1));
  if (!buckets.some((b) => Number(b.count || b.seconds || b.percent || 0) > 0)) {
    return <div style={{ fontSize: 12, color: theme.textMuted }}>No pace distribution for this selection</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {buckets.map((bucket) => {
        const value = Number(bucket.percent != null ? bucket.percent : bucket.count || 0);
        const widthPct = bucket.percent != null
          ? Math.min(100, value)
          : Math.min(100, (Number(bucket.count || 0) / max) * 100);
        return (
          <div key={bucket.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 48px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{bucket.label}</span>
            <div style={{ height: 8, borderRadius: 999, background: `${theme.cardBorder}`, overflow: 'hidden' }}>
              <div style={{ width: `${widthPct}%`, height: '100%', background: 'linear-gradient(90deg,#fc5200,#f97316)' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>
              {bucket.percent != null ? `${bucket.percent}%` : bucket.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CollapsibleBlock({ title, children, theme, defaultOpen = false, open: openProp, onOpenChange }) {
  const [openInternal, setOpenInternal] = useState(defaultOpen);
  const controlled = typeof openProp === 'boolean';
  const open = controlled ? openProp : openInternal;
  const setOpen = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (!controlled) setOpenInternal(value);
    if (onOpenChange) onOpenChange(value);
  };
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: theme.textHeading,
          padding: '12px 16px',
          fontWeight: 800,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open ? <div style={{ padding: '0 14px 14px' }}>{children}</div> : null}
    </div>
  );
}

function RunningTab({
  runStats,
  wellStats,
  wellSummary,
  name,
  theme,
  runRows,
  userId,
  onOpenMarathonPlan,
  goalRefreshKey,
  entries,
  runningShoes,
  onRunningShoesChange,
  onEntriesChange,
  stravaInsights,
  onOpenRun,
  mapsRefreshKey = 0,
}) {
  const noData = !(runRows || []).some((r) => Number(r.distance || 0) > 0);
  const insights = useMemo(() => buildRunningInsights(runRows), [runRows]);
  const paceDelta = insights.avgPace7 && insights.avgPace30
    ? insights.avgPace7 - insights.avgPace30
    : null;
  const importedRuns = useMemo(() => buildRunningRows(entries).filter((row) => row.stravaId), [entries]);
  const [savingShoeId, setSavingShoeId] = useState(null);
  const [deletingRunId, setDeletingRunId] = useState(null);
  const [assignError, setAssignError] = useState('');
  const untaggedRuns = importedRuns.filter((run) => !run.shoeId).length;
  const [shoesOpen, setShoesOpen] = useState(!runningShoes.filter((s) => !s.retired).length || untaggedRuns > 0);
  const [forceEditPastRuns, setForceEditPastRuns] = useState(false);
  const shoesSectionRef = useRef(null);
  const hrDashboard = useMemo(() => buildHeartRateDashboard(runRows, stravaInsights), [runRows, stravaInsights]);

  const trainingTip = useMemo(() => {
    const goal = userId ? loadMarathonGoal(userId) : null;
    const goalDistanceKm = Number(goal?.distanceKm) || 21.0975;
    const readiness = buildMarathonReadiness({
      runs: runRows,
      goalDistanceKm,
      raceDate: goal?.raceDate || null,
    });
    return buildTrainingTip({
      runRows,
      goalDistanceKm,
      longRunTargetKm: readiness?.longRunTargetKm,
      readiness,
    });
  }, [runRows, userId, goalRefreshKey]);

  const openShoeAssigner = () => {
    setShoesOpen(true);
    setForceEditPastRuns(true);
    if (shoesSectionRef.current?.scrollIntoView) {
      shoesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAssignShoe = async (stravaId, shoeId) => {
    if (!userId || !stravaId) return;
    if (!isWellnessApiReady()) {
      setAssignError('Unable to reach wellness API from this page.');
      return;
    }
    setAssignError('');
    setSavingShoeId(stravaId);
    try {
      const response = await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(stravaId)}/shoe`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shoeId: shoeId || '' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setAssignError(payload?.error || 'Could not save shoe on that run. Try again.');
        return;
      }
      if (Array.isArray(payload?.state?.entries) && typeof onEntriesChange === 'function') {
        onEntriesChange(payload.state.entries);
        try {
          localStorage.setItem(`cosmix-wellness-${userId}-entries`, JSON.stringify(payload.state.entries));
        } catch (_) { /* ignore */ }
      }
    } catch (_) {
      setAssignError('Network error while saving shoe. Try again.');
    } finally {
      setSavingShoeId(null);
    }
  };

  const handleDeleteRun = async (stravaId) => {
    if (!userId || !stravaId) return;
    if (!isWellnessApiReady()) {
      setAssignError('Unable to reach wellness API from this page.');
      return;
    }
    setAssignError('');
    setDeletingRunId(stravaId);
    try {
      const response = await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(stravaId)}`), {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setAssignError(payload?.error || 'Could not delete that run.');
        return;
      }
      if (Array.isArray(payload?.state?.entries) && typeof onEntriesChange === 'function') {
        onEntriesChange(payload.state.entries);
        try {
          localStorage.setItem(`cosmix-wellness-${userId}-entries`, JSON.stringify(payload.state.entries));
        } catch (_) { /* ignore */ }
      }
    } catch (_) {
      setAssignError('Network error while deleting run.');
    } finally {
      setDeletingRunId(null);
    }
  };

  const paceTrend = useMemo(() => buildRunTrendBuckets(runRows, (r) => (
    r.distance > 0 && r.minutes > 0 ? r.minutes / r.distance : 0
  )), [runRows]);

  const hrTrend = useMemo(() => buildRunTrendBuckets(runRows, (r) => (
    Number(r.avgHeartrate || r.avgHeartRate || 0)
  )), [runRows]);

  const paceTrendSubtitle = paceTrend.spanDays > 31
    ? 'Weekly average · scales when over 1 month'
    : paceTrend.bucketUnit === 'day'
      ? 'Daily average · last runs'
      : 'Per run';

  const hrTrendSubtitle = hrTrend.spanDays > 31
    ? 'Weekly average · scales when over 1 month'
    : hrTrend.bucketUnit === 'day'
      ? 'Daily average · last runs'
      : 'Per run';

  const runLeaderboards = useMemo(
    () => computeRunLeaderboards(entries, runningShoes, 5),
    [entries, runningShoes],
  );

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {trainingTip ? <CoachBotCard tip={trainingTip} theme={theme} runRows={runRows} /> : null}

      {userId && !noData ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ShareRunButton
            userId={userId}
            athleteName={name}
            theme={theme}
            compact
          />
        </div>
      ) : null}

      <MarathonRaceHub userId={userId} runRows={runRows} theme={theme} onOpenPlan={onOpenMarathonPlan} refreshKey={goalRefreshKey} compact />

      {!noData ? (
        <div className="run-dash-mini-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          <DepthMetric label="7-day km" value={`${insights.km7.toFixed(1)}`} sub={`${insights.runs7} runs`} accent={theme.orange} theme={theme} />
          <DepthMetric label="30-day km" value={`${insights.km30.toFixed(1)}`} sub={`${insights.runs30} runs`} accent={theme.blue} theme={theme} />
          <DepthMetric label="Pace 7d" value={insights.avgPace7 ? fmtPace(insights.avgPace7) : '--'} sub={paceDelta != null ? `${paceDelta < 0 ? 'Faster' : 'Slower'} vs 30d` : 'rolling'} accent={theme.cyan} theme={theme} />
          <DepthMetric
            label="Peak speed"
            value={runStats?.fastestSpeed != null ? `${runStats.fastestSpeed}` : '--'}
            sub={runStats?.speedSource === 'best_1km_split' ? 'best 1 km split' : 'km/h best'}
            accent={theme.green}
            theme={theme}
          />
        </div>
      ) : null}

      {(stravaInsights?.connected || stravaInsights?.runCount > 0) ? (
        <CollapsibleBlock title="Route & zones" theme={theme} defaultOpen>
          <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
            <div className="run-dash-mini-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              <MiniStat label="Synced runs" value={`${stravaInsights.runCount || 0}`} sub={`${stravaInsights.totalDistanceKm || 0} km`} accent="#fc5200" theme={theme} />
              <MiniStat label="Best pace" value={stravaInsights.bestPaceMinPerKm ? fmtPace(stravaInsights.bestPaceMinPerKm) : '--'} sub="season" accent={theme.cyan} theme={theme} />
              <MiniStat label="Longest" value={stravaInsights.longestRunKm ? `${stravaInsights.longestRunKm} km` : '--'} sub={stravaInsights.longestRun ? fmtDate(stravaInsights.longestRun.date) : ''} accent={theme.blue} theme={theme} />
              <MiniStat
                label="Fastest split"
                value={stravaInsights.bestSplitPaceMinPerKm ? fmtPace(stravaInsights.bestSplitPaceMinPerKm) : '--'}
                sub={stravaInsights.bestSplitRun?.bestSplitKm ? `Km ${stravaInsights.bestSplitRun.bestSplitKm}` : '1 km best'}
                accent={theme.green}
                theme={theme}
              />
            </div>
            <StravaRunExplorer userId={userId} theme={theme} onOpenRun={onOpenRun} refreshKey={mapsRefreshKey} />
          </div>
        </CollapsibleBlock>
      ) : (
        <div style={{ borderRadius: 18, border: `1px dashed ${theme.cardBorder}`, padding: 16, color: theme.textMuted, fontSize: 13 }}>
          Connect Strava on Wellness to import GPS maps and pace zones.
        </div>
      )}

      {noData ? <EmptyState sport="Running" theme={theme} /> : (
      <>
      <CollapsibleBlock title="Trends" theme={theme} defaultOpen>
        <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
          <div className="run-dash-charts-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <RunTrendChart
              title="Average pace"
              subtitle={paceTrendSubtitle}
              points={paceTrend.points}
              overallAvg={paceTrend.overallAvg}
              last10Avg={paceTrend.last10Avg}
              theme={theme}
              accent={CHART_SOFT.cyan}
              valueFmt={(v) => fmtPace(v).replace(' /km', '')}
              invertY
              lowerIsBetter
              unitLabel="/km"
            />
            <RunTrendChart
              title="Average heart rate"
              subtitle={hrTrendSubtitle}
              points={hrTrend.points}
              overallAvg={hrTrend.overallAvg}
              last10Avg={hrTrend.last10Avg}
              theme={theme}
              accent={CHART_SOFT.hr}
              valueFmt={(v) => `${Math.round(v)}`}
              unitLabel=" bpm"
            />
          </div>
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Run rankings" theme={theme} defaultOpen>
        <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
          <div className="run-dash-charts-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <RunLeaderboard
              title="Best HR · 5 km+"
              subtitle="Lowest avg heart rate · runs ≥ 5 km"
              rows={runLeaderboards.bestHr5}
              theme={theme}
              accent={CHART_SOFT.hr}
              metricKey="avgHeartrate"
              metricFmt={(v) => `${Math.round(v)} bpm`}
              emptyText="Need runs ≥ 5 km with heart rate data."
              limit={5}
            />
            <RunLeaderboard
              title="Best HR · 10 km+"
              subtitle="Lowest avg heart rate · runs ≥ 10 km"
              rows={runLeaderboards.bestHr10}
              theme={theme}
              accent={CHART_SOFT.hrAlt}
              metricKey="avgHeartrate"
              metricFmt={(v) => `${Math.round(v)} bpm`}
              emptyText="Need runs ≥ 10 km with heart rate data."
              limit={5}
            />
            <RunLeaderboard
              title="Best speed · 5 km+"
              subtitle="Highest avg speed · runs ≥ 5 km"
              rows={runLeaderboards.bestSpeed5}
              theme={theme}
              accent={CHART_SOFT.green}
              metricKey="speed"
              metricFmt={(v) => `${Number(v).toFixed(1)} km/h`}
              emptyText="Need runs ≥ 5 km with pace data."
              limit={5}
            />
            <RunLeaderboard
              title="Best speed · 10 km+"
              subtitle="Highest avg speed · runs ≥ 10 km"
              rows={runLeaderboards.bestSpeed10}
              theme={theme}
              accent={CHART_SOFT.blue}
              metricKey="speed"
              metricFmt={(v) => `${Number(v).toFixed(1)} km/h`}
              emptyText="Need runs ≥ 10 km with pace data."
              limit={5}
            />
          </div>
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Heart rate" theme={theme} defaultOpen={false}>
        <HeartRateDashboard hrDashboard={hrDashboard} theme={theme} onOpenRun={onOpenRun} />
      </CollapsibleBlock>

      <CollapsibleBlock title="Shoe analytics" theme={theme} defaultOpen>
        <ShoeStatsSection entries={entries} shoes={runningShoes} theme={theme} onAssignShoes={openShoeAssigner} />
      </CollapsibleBlock>

      <div ref={shoesSectionRef}>
        <CollapsibleBlock
          title={
            runningShoes.filter((s) => !s.retired).length
              ? `Manage shoes (${runningShoes.filter((s) => !s.retired).length})`
              : 'Manage shoes'
          }
          theme={theme}
          open={shoesOpen}
          onOpenChange={setShoesOpen}
        >
          <RunningShoesPanel
            userId={userId}
            shoes={runningShoes}
            onChange={onRunningShoesChange}
            theme={theme}
            importedRuns={importedRuns}
            onAssignShoe={handleAssignShoe}
            onDeleteRun={handleDeleteRun}
            savingShoeId={savingShoeId}
            deletingRunId={deletingRunId}
            assignError={assignError}
            forceEditPastRuns={forceEditPastRuns}
          />
        </CollapsibleBlock>
      </div>

      <CollapsibleBlock title="Records" theme={theme} defaultOpen={false}>
        <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px', marginTop: 4 }}>
          <RecordCard
            label="Fastest Speed"
            value={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.speed} km/h` : null}
            detail1={runStats.fastestSpeedRun
              ? (runStats.speedSource === 'best_1km_split'
                ? `Best 1 km split${runStats.fastestSpeedRun.splitKm ? ` · Km ${runStats.fastestSpeedRun.splitKm}` : ''} · ${runStats.fastestSpeedRun.time}`
                : `${runStats.fastestSpeedRun.distance} km in ${runStats.fastestSpeedRun.time}`)
              : null}
            detail2={runStats.fastestSpeedRun ? fmtDate(runStats.fastestSpeedRun.date) : null}
            accent={theme.green}
            theme={theme}
          />
          <RecordCard label="Longest Run" value={runStats.longestDistanceRun ? `${runStats.longestDistanceRun.distance} km` : null} detail1={runStats.longestDistanceRun ? `${runStats.longestDistanceRun.time} · ${runStats.longestDistanceRun.speed} km/h` : null} detail2={runStats.longestDistanceRun ? fmtDate(runStats.longestDistanceRun.date) : null} accent={theme.blue} theme={theme} />
          <RecordCard
            label="Fastest Split"
            value={stravaInsights?.bestSplitPaceMinPerKm ? fmtPace(stravaInsights.bestSplitPaceMinPerKm) : null}
            detail1={stravaInsights?.bestSplitRun?.bestSplitKm
              ? `Km ${stravaInsights.bestSplitRun.bestSplitKm}${stravaInsights.bestSplitRun.bestSplitSeconds ? ` · ${Math.floor(stravaInsights.bestSplitRun.bestSplitSeconds / 60)}:${String(Math.round(stravaInsights.bestSplitRun.bestSplitSeconds % 60)).padStart(2, '0')}` : ''}`
              : 'Best 1 km from GPS'}
            detail2={stravaInsights?.bestSplitRun?.date ? fmtDate(stravaInsights.bestSplitRun.date) : null}
            accent={theme.cyan}
            theme={theme}
          />
          <RecordCard label="Total Distance" value={`${runStats.totalDistance} km`} detail1={`${runStats.totalRuns} runs`} accent={theme.orange} theme={theme} />
          {wellSummary ? <RecordCard label={`${name}'s streak`} value={`${wellSummary.runningStreak} days`} detail1={`Best ${wellSummary.longestRunningStreak} days`} accent={theme.emerald} theme={theme} /> : null}
        </div>
      </CollapsibleBlock>
      </>
      )}
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
    { label: 'Yoga', emoji: '🧘', key: 'yoga', sessions: allSportStats.yoga?.count || 0, mins: allSportStats.yoga?.totalMinutes || 0, accent: theme.purple || '#a855f7' },
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
const PRIMARY_TABS = [
  { id: 'running', label: 'Running', emoji: '🏃' },
  { id: 'overview', label: 'Overview', emoji: '📊' },
];
const MORE_SPORT_TABS = [
  { id: 'badminton', label: 'Badminton', emoji: '🏸' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘' },
  { id: 'cycling', label: 'Cycling', emoji: '🚴' },
  { id: 'walking', label: 'Walking', emoji: '🚶' },
  { id: 'swimming', label: 'Swimming', emoji: '🏊' },
];

export default function RunningAnalytics() {
  const router = useRouter();
  const { theme: baseTheme } = useTheme();
  const [surfaceId, setSurfaceId] = useState('night');
  const theme = useMemo(() => mergeRunningSurface(baseTheme, surfaceId), [baseTheme, surfaceId]);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('running');
  const [showMarathonModal, setShowMarathonModal] = useState(false);
  const [goalRefreshKey, setGoalRefreshKey] = useState(0);
  const [showOtherSports, setShowOtherSports] = useState(false);
  const [runningShoes, setRunningShoes] = useState([]);
  const [stravaInsights, setStravaInsights] = useState(null);
  const [serverEntries, setServerEntries] = useState(null);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaSyncMsg, setStravaSyncMsg] = useState('');
  const [mapsRefreshKey, setMapsRefreshKey] = useState(0);
  const [prRecords, setPrRecords] = useState([]);
  const [showPrModal, setShowPrModal] = useState(false);

  const refreshWellnessPayload = async (uid) => {
    if (!uid || !isWellnessApiReady()) return;
    const [dataPayload, insightsPayload] = await Promise.all([
      fetch(wellnessApiUrl(`/wellness/data/${encodeURIComponent(uid)}`)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(wellnessApiUrl(`/wellness/strava/insights/${encodeURIComponent(uid)}?days=180`)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (Array.isArray(dataPayload?.entries)) {
      setServerEntries(dataPayload.entries);
      try {
        localStorage.setItem(`cosmix-wellness-${uid}-entries`, JSON.stringify(dataPayload.entries));
      } catch (_) { /* ignore */ }
    }
    if (Array.isArray(dataPayload?.runningShoes) && dataPayload.runningShoes.length) {
      setRunningShoes(saveRunningShoesLocal(uid, dataPayload.runningShoes));
    }
    if (insightsPayload) setStravaInsights(insightsPayload);
  };

  const handleStravaSync = async () => {
    if (!user?.id || stravaSyncing) return;
    setStravaSyncing(true);
    setStravaSyncMsg('Syncing Strava…');
    try {
      const payload = await runStravaAutoSync({
        userId: user.id,
        apiBase: '',
        force: true,
        onMessage: setStravaSyncMsg,
        onEntries: (nextEntries) => {
          if (Array.isArray(nextEntries)) {
            setServerEntries(nextEntries);
            try {
              localStorage.setItem(`cosmix-wellness-${user.id}-entries`, JSON.stringify(nextEntries));
            } catch (_) { /* ignore */ }
          }
        },
      });
      await refreshWellnessPayload(user.id);
      setMapsRefreshKey((k) => k + 1);
      if (!payload) setStravaSyncMsg('Strava sync failed — try again.');
      else setStravaSyncMsg(formatStravaSyncMessage(payload));
    } finally {
      setStravaSyncing(false);
    }
  };

  useEffect(() => {
    restoreUserSession(router, setUser);
    setSurfaceId(loadRunningSurfaceId());
  }, [router]);

  useEffect(() => {
    if (!user?.id || !isWellnessApiReady()) return undefined;
    let cancelled = false;
    const lastSync = Number(localStorage.getItem(`cosmix-strava-last-sync-${user.id}`) || 0);
    const stale = !lastSync || (Date.now() - lastSync > 45 * 60 * 1000);
    // Pull latest Strava runs when opening Running — force if older than 45 min so today's map appears.
    void runStravaAutoSync({
      userId: user.id,
      apiBase: '',
      force: stale,
      onMessage: (msg) => {
        if (!cancelled && msg) setStravaSyncMsg(msg);
      },
      onEntries: (nextEntries) => {
        if (cancelled || !Array.isArray(nextEntries)) return;
        setServerEntries(nextEntries);
        try {
          localStorage.setItem(`cosmix-wellness-${user.id}-entries`, JSON.stringify(nextEntries));
        } catch (_) { /* ignore */ }
      },
    }).then(async (payload) => {
      if (cancelled || !payload || payload.skippedDueToInterval) return;
      await refreshWellnessPayload(user.id);
      setMapsRefreshKey((k) => k + 1);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!router.isReady || !user?.id) return;
    if (router.query.setup === '1') setShowMarathonModal(true);
  }, [router.isReady, router.query.setup, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    setRunningShoes(readRunningShoes(user.id));
    void loadRunningShoesFromServer(user.id).then((shoes) => {
      if (shoes?.length) setRunningShoes(shoes);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isWellnessApiReady()) return undefined;
    let cancelled = false;
    fetch(wellnessApiUrl(`/wellness/data/${encodeURIComponent(user.id)}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        if (Array.isArray(payload.entries)) {
          setServerEntries(payload.entries);
          try {
            localStorage.setItem(`cosmix-wellness-${user.id}-entries`, JSON.stringify(payload.entries));
          } catch (_) { /* ignore */ }
        }
        if (Array.isArray(payload.runningShoes) && payload.runningShoes.length) {
          setRunningShoes(saveRunningShoesLocal(user.id, payload.runningShoes));
        }
      })
      .catch(() => {});
    fetch(wellnessApiUrl(`/wellness/strava/insights/${encodeURIComponent(user.id)}?days=180`))
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setStravaInsights(payload);
      })
      .catch(() => {
        if (!cancelled) setStravaInsights(null);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const wellSummary = useMemo(() => (user?.id ? buildWellnessSummary(user.id) : null), [user?.id, serverEntries]);
  const entries = useMemo(
    () => (Array.isArray(serverEntries) && serverEntries.length ? serverEntries : (wellSummary?.entries || [])),
    [serverEntries, wellSummary],
  );
  const runRows = useMemo(() => buildRunningRows(entries), [entries]);
  const name = user?.name || user?.username || 'Athlete';

  useEffect(() => {
    if (!user?.id || !runRows.length) return;
    const { records } = detectNewPersonalRecords({
      userId: user.id,
      runRows,
      stravaInsights,
    });
    if (records.length) {
      setPrRecords(records);
      setShowPrModal(true);
    }
  }, [user?.id, runRows, stravaInsights]);
  const runStats = useMemo(() => {
    if (!user?.id) return null;
    return computeRunningStats(user.id, {
      bestSplitPaceMinPerKm: stravaInsights?.bestSplitPaceMinPerKm,
      bestSplitRun: stravaInsights?.bestSplitRun || null,
    });
  }, [user?.id, entries, stravaInsights?.bestSplitPaceMinPerKm, stravaInsights?.bestSplitRun]);
  const wellStats = useMemo(() => (user?.id ? computeWellnessStats(user.id) : null), [user?.id, entries]);

  const allSportStats = useMemo(() => ({
    running: computeSportStats(entries, 'runningMinutes', 'runningDistanceKm'),
    badminton: computeSportStats(entries, 'badmintonMinutes'),
    yoga: computeSportStats(entries, 'yogaMinutes'),
    cycling: computeSportStats(entries, 'cyclingMinutes'),
    walking: computeSportStats(entries, 'walkingMinutes', 'walkingDistanceKm'),
    swimming: computeSportStats(entries, 'swimmingMinutes'),
  }), [entries]);

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, padding: '24px 24px 0', fontFamily: theme.font }} className="running-analytics-page">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        .running-analytics-page { padding-bottom: 0; }
        .sport-tab-strip {
          display: flex;
          gap: 6px;
          padding: 6px;
          border-radius: 16px;
          background: ${surfaceId === 'trail' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.35)'};
          border: 1px solid ${theme.cardBorder};
          overflow-x: auto;
        }
        .surface-trail .run-page-header h1 { letter-spacing: -0.02em; }
        .surface-night .run-page-header h1 { letter-spacing: 0.02em; text-shadow: 0 0 24px ${theme.accentGlow || 'transparent'}; }
        .sport-tab-btn {
          appearance: none;
          border: 1px solid transparent;
          border-radius: 12px;
          background: transparent;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          transition: background 0.15s, border-color 0.15s;
        }
        .sport-tab-btn.is-active {
          box-shadow: 0 8px 20px rgba(249,115,22,0.15);
        }
        @media (max-width: 900px) {
          .sport-4col { grid-template-columns: 1fr 1fr !important; }
          .sport-3col { grid-template-columns: 1fr 1fr !important; }
          .sport-2col { grid-template-columns: 1fr !important; }
          .marathon-hero-grid { grid-template-columns: 1fr !important; justify-items: center !important; }
          .marathon-metric-grid { grid-template-columns: 1fr 1fr !important; width: 100% !important; }
          .marathon-readiness-block { grid-template-columns: 1fr !important; justify-items: center !important; }
          .marathon-score-grid { grid-template-columns: 1fr !important; }
          .marathon-goal-inputs { grid-template-columns: 1fr !important; }
    .run-dash-charts-2 { grid-template-columns: 1fr !important; }
    .run-dash-mini-grid { grid-template-columns: 1fr 1fr !important; }
        }
        .run-page-header {
          display: grid;
          gap: 14px;
          padding: 16px;
          border-radius: 20px;
        }
        .run-page-header-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .run-page-header-copy {
          flex: 1;
          min-width: 0;
        }
        .run-page-header-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          flex-wrap: nowrap;
          align-items: center;
        }
        .run-header-btn {
          appearance: none;
          border-radius: 11px;
          padding: 9px 12px;
          cursor: pointer;
          font-weight: 800;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .run-header-btn-label-long { display: inline; }
        .run-header-btn-label-short { display: none; }
        .run-page-sync-msg {
          font-size: 12px;
          line-height: 1.35;
          padding: 0 2px;
        }
        @media (max-width: 560px) {
          .running-analytics-page { padding: 12px 12px 0 !important; }
          .sport-4col { grid-template-columns: 1fr !important; }
          .sport-3col { grid-template-columns: 1fr !important; }
          .marathon-metric-grid { grid-template-columns: 1fr !important; }
          .sport-tab-strip { flex-wrap: nowrap !important; }
          .sport-tab-btn { flex: 0 0 auto; }
          .marathon-modal-backdrop { align-items: flex-end !important; }
          .run-page-header { padding: 14px !important; gap: 12px !important; }
          .run-page-header-top {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .run-page-header-actions {
            width: 100%;
            display: grid;
            grid-template-columns: 1.2fr 1fr 0.7fr;
            gap: 8px;
          }
          .run-header-btn {
            width: 100%;
            padding: 10px 8px;
            font-size: 11px;
          }
          .run-header-btn-label-long { display: none; }
          .run-header-btn-label-short { display: inline; }
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '16px' }}>

        <div
          className={`run-page-header surface-${surfaceId}`}
          style={{
            background: surfaceId === 'night'
              ? `linear-gradient(135deg, ${theme.orange}22, ${theme.cyan}12, ${theme.cardBg})`
              : `linear-gradient(145deg, #ffffffee, ${theme.orange}12, ${theme.cardBg})`,
            border: `1px solid ${theme.cardBorder}`,
            boxShadow: theme.chartDepth,
            fontFamily: theme.font,
          }}
        >
          <div className="run-page-header-top">
            <div className="run-page-header-copy">
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted }}>
                {surfaceId === 'night' ? 'Night track' : 'Trail light'}
              </div>
              <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(24px,5vw,30px)', fontWeight: 900, color: theme.textHeading, lineHeight: 1.1 }}>
                {surfaceId === 'night' ? 'Race cockpit' : 'Trail board'}
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: theme.textSecondary, display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center' }}>
                <span>{runStats?.totalRuns || 0} runs</span>
                <span style={{ color: theme.textMuted }}>·</span>
                <Link href="/running-maps" style={{ color: theme.orange, fontWeight: 800, textDecoration: 'none' }}>
                  Map archive
                </Link>
              </p>
            </div>
            <div className="run-page-header-actions">
              <button
                type="button"
                className="run-header-btn"
                onClick={handleStravaSync}
                disabled={stravaSyncing}
                style={{
                  border: `1px solid ${theme.cardBorder}`,
                  background: theme.cardBg,
                  color: theme.textHeading,
                  opacity: stravaSyncing ? 0.7 : 1,
                  cursor: stravaSyncing ? 'default' : 'pointer',
                }}
              >
                <span className="run-header-btn-label-long">{stravaSyncing ? 'Syncing…' : 'Sync Strava'}</span>
                <span className="run-header-btn-label-short">{stravaSyncing ? '…' : 'Sync'}</span>
              </button>
              <button
                type="button"
                className="run-header-btn"
                aria-label={surfaceId === 'night' ? 'Switch to trail light' : 'Switch to night track'}
                onClick={() => {
                  const next = surfaceId === 'night' ? 'trail' : 'night';
                  setSurfaceId(next);
                  saveRunningSurfaceId(next);
                }}
                style={{
                  border: `1px solid ${theme.cardBorder}`,
                  background: theme.cardBg,
                  color: theme.textHeading,
                }}
              >
                <span className="run-header-btn-label-long">{surfaceId === 'night' ? '☀ Trail light' : '☾ Night track'}</span>
                <span className="run-header-btn-label-short">{surfaceId === 'night' ? '☀ Trail' : '☾ Night'}</span>
              </button>
              <button
                type="button"
                className="run-header-btn"
                onClick={() => setShowMarathonModal(true)}
                style={{ border: 'none', background: theme.orange, color: '#fff' }}
              >
                Goal
              </button>
            </div>
          </div>
        </div>
        {stravaSyncMsg ? (
          <div className="run-page-sync-msg" style={{ color: theme.textSecondary }}>{stravaSyncMsg}</div>
        ) : null}

        <div className="sport-tab-strip" role="tablist" aria-label="Sport analytics">
          {PRIMARY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`sport-tab-btn${isActive ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  border: isActive ? `1px solid ${theme.orange}` : '1px solid transparent',
                  background: isActive ? `${theme.orange}18` : 'transparent',
                  color: isActive ? theme.orange : theme.textSecondary,
                }}
              >
                <span aria-hidden="true">{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`sport-tab-btn sport-tab-btn--other${showOtherSports ? ' is-active' : ''}`}
            onClick={() => setShowOtherSports((v) => !v)}
            style={{
              border: showOtherSports ? `1px solid ${theme.cyan}` : '1px solid transparent',
              background: showOtherSports ? `${theme.cyan}18` : 'transparent',
              color: showOtherSports ? theme.cyan : theme.textSecondary,
            }}
          >
            <span aria-hidden="true">🏸</span>
            <span>Other sports</span>
          </button>
        </div>
        {showOtherSports && (
          <div className="sport-tab-strip sport-tab-strip--other">
            {MORE_SPORT_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`sport-tab-btn${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    border: isActive ? `1px solid ${theme.cyan}` : '1px solid transparent',
                    background: isActive ? `${theme.cyan}18` : 'transparent',
                    color: isActive ? theme.cyan : theme.textSecondary,
                  }}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Tab Content ── */}
        {activeTab === 'overview' && (
          <OverviewTab wellStats={wellStats} wellSummary={wellSummary} allSportStats={allSportStats} name={name} theme={theme} />
        )}
        {activeTab === 'running' && (
          <RunningTab
            runStats={runStats}
            wellStats={wellStats}
            wellSummary={wellSummary}
            name={name}
            theme={theme}
            runRows={runRows}
            entries={entries}
            runningShoes={runningShoes}
            onRunningShoesChange={setRunningShoes}
            onEntriesChange={setServerEntries}
            userId={user?.id}
            onOpenMarathonPlan={() => setShowMarathonModal(true)}
            goalRefreshKey={goalRefreshKey}
            stravaInsights={stravaInsights}
            mapsRefreshKey={mapsRefreshKey}
            onOpenRun={(activityId) => router.push(`/running/${activityId}`)}
          />
        )}
        {activeTab === 'badminton' && (
          <SimpleSportTab stats={allSportStats.badminton} name={name} sportLabel="Badminton" minKey="badmintonMinutes" showDistance={false} accent={theme.yellow || '#eab308'} theme={theme} />
        )}
        {activeTab === 'yoga' && (
          <SimpleSportTab stats={allSportStats.yoga} name={name} sportLabel="Yoga" minKey="yogaMinutes" showDistance={false} accent={theme.purple || '#a855f7'} theme={theme} />
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

      <MarathonGoalModal
        open={showMarathonModal}
        onClose={() => setShowMarathonModal(false)}
        userId={user?.id}
        runRows={allSportStats.running?.rows || []}
        theme={theme}
        onSaved={() => {
          setGoalRefreshKey((k) => k + 1);
          if (router.query.setup) router.replace('/running-analytics', undefined, { shallow: true });
        }}
        initialTab={router.query.setup ? 'goal' : 'plan'}
      />

      <PersonalRecordModal
        open={showPrModal && prRecords.length > 0}
        records={prRecords}
        userId={user?.id}
        athleteName={name}
        theme={theme}
        onClose={() => {
          setShowPrModal(false);
          setPrRecords([]);
        }}
      />

      <MobileBottomNav
        theme={theme}
        activeId="stats"
        items={[
          { id: 'home', label: 'Home', icon: '🏠', href: '/dashboard' },
          { id: 'wellness', label: 'Henna', icon: '🌿', href: '/wellness' },
          { id: 'stats', label: 'Running', icon: '🏃', href: '/running-analytics' },
          { id: 'board', label: 'Ranks', icon: '🏆', href: '/leaderboard' },
        ]}
      />
    </div>
  );
}
