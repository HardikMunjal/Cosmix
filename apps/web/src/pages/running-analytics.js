import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { MarathonGoalModal, MarathonRaceHub } from '../lib/MarathonRaceHub';
import { MobileBottomNav } from '../lib/MobileNav';
import { useTheme } from '../lib/ThemePicker';
import { computeRunningStats, computeWellnessStats, buildWellnessSummary } from '../lib/userInsights';
import {
  buildRunningRows,
  computeShoeStats,
  createRunningShoeId,
  getRunningShoeLabel,
  loadRunningShoesFromServer,
  readRunningShoes,
  saveRunningShoesLocal,
  syncRunningShoesToServer,
} from '../lib/runningShoes';

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
  const rows = [...runRows]
    .filter((r) => r.distance > 0 && r.minutes > 0)
    .map((r) => ({
      ...r,
      pace: r.minutes / r.distance,
      speed: r.distance / (r.minutes / 60),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const today = new Date();
  const dayMs = 86400000;
  const cutoff7 = new Date(today.getTime() - 7 * dayMs).toISOString().slice(0, 10);
  const cutoff30 = new Date(today.getTime() - 30 * dayMs).toISOString().slice(0, 10);

  const last7 = rows.filter((r) => r.date >= cutoff7);
  const last30 = rows.filter((r) => r.date >= cutoff30);

  const avgPace = (list) => (list.length ? list.reduce((s, r) => s + r.pace, 0) / list.length : null);
  const totalKm = (list) => list.reduce((s, r) => s + r.distance, 0);

  const weekdayKm = Array.from({ length: 7 }, () => 0);
  const weekdayRuns = Array.from({ length: 7 }, () => 0);
  rows.forEach((r) => {
    const dow = new Date(`${r.date}T12:00:00`).getDay();
    weekdayKm[dow] += r.distance;
    weekdayRuns[dow] += 1;
  });
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const monthMap = {};
  rows.forEach((r) => {
    const key = String(r.date).slice(0, 7);
    if (!monthMap[key]) monthMap[key] = { month: key, km: 0, runs: 0, longest: 0 };
    monthMap[key].km += r.distance;
    monthMap[key].runs += 1;
    monthMap[key].longest = Math.max(monthMap[key].longest, r.distance);
  });
  const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  const recentRuns = rows.slice(0, 8);

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
    <div style={{ padding: '12px 14px', borderRadius: 14, background: `${accent}12`, border: `1px solid ${accent}33` }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: accent, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>{sub}</div> : null}
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

function RunningShoesPanel({ userId, shoes, onChange, theme }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');

  function handleAdd() {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return;
    const next = [
      ...shoes,
      {
        id: createRunningShoeId(),
        name: trimmedName,
        brand: String(brand || '').trim(),
        createdAt: new Date().toISOString(),
        retired: false,
      },
    ];
    const saved = saveRunningShoesLocal(userId, next);
    onChange(saved);
    void syncRunningShoesToServer(userId, saved);
    setName('');
    setBrand('');
  }

  function handleRemove(shoeId) {
    const next = shoes.filter((shoe) => shoe.id !== shoeId);
    const saved = saveRunningShoesLocal(userId, next);
    onChange(saved);
    void syncRunningShoesToServer(userId, saved);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)" style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.textPrimary }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shoe name" style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.textPrimary }} />
        <button type="button" onClick={handleAdd} style={{ border: 'none', borderRadius: 12, padding: '10px 14px', background: theme.orange, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Add</button>
      </div>
      {!shoes.length ? (
        <div style={{ fontSize: 13, color: theme.textMuted }}>No shoes yet. Add your running shoes to track km, pace, and speed per pair.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shoes.map((shoe) => (
            <div key={shoe.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 14, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg }}>
              <div>
                <div style={{ fontWeight: 800, color: theme.textHeading }}>{getRunningShoeLabel(shoe)}</div>
              </div>
              <button type="button" onClick={() => handleRemove(shoe.id)} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 10, background: 'transparent', color: theme.textMuted, padding: '6px 10px', cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
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

function ShoeStatsSection({ entries, shoes, theme }) {
  const shoeStats = useMemo(() => computeShoeStats(entries, shoes), [entries, shoes]);
  if (!shoeStats.length) {
    return (
      <div style={{ padding: 16, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 13 }}>
        Log runs with shoes selected to see per-shoe pace, speed, and distance stats.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ShoeKmChart shoeStats={shoeStats} theme={theme} />
      <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {shoeStats.map((row) => (
          <div key={row.shoeId || row.label} style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted }}>{row.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, fontSize: 12 }}>
              <div><span style={{ color: theme.textMuted }}>Runs</span><div style={{ fontWeight: 800, color: theme.orange }}>{row.runs}</div></div>
              <div><span style={{ color: theme.textMuted }}>Total km</span><div style={{ fontWeight: 800, color: theme.blue }}>{row.totalKm}</div></div>
              <div><span style={{ color: theme.textMuted }}>Avg distance</span><div style={{ fontWeight: 800, color: theme.green }}>{row.avgDistance} km</div></div>
              <div><span style={{ color: theme.textMuted }}>Avg pace</span><div style={{ fontWeight: 800, color: theme.cyan }}>{row.avgPace ? fmtPace(row.avgPace) : '--'}</div></div>
              <div><span style={{ color: theme.textMuted }}>Avg speed</span><div style={{ fontWeight: 800, color: theme.purple }}>{row.avgSpeed} km/h</div></div>
              <div><span style={{ color: theme.textMuted }}>Longest run</span><div style={{ fontWeight: 800, color: theme.textHeading }}>{row.longestRunKm} km</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleBlock({ title, children, theme, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
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

function RunningTab({ runStats, wellStats, wellSummary, name, theme, runRows, userId, onOpenMarathonPlan, goalRefreshKey, entries, runningShoes, onRunningShoesChange, stravaInsights }) {
  const noData = !runStats || runStats.totalRuns === 0;
  const insights = useMemo(() => buildRunningInsights(runRows), [runRows]);
  const paceDelta = insights.avgPace7 && insights.avgPace30
    ? insights.avgPace7 - insights.avgPace30
    : null;

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <MarathonRaceHub userId={userId} runRows={runRows} theme={theme} onOpenPlan={onOpenMarathonPlan} refreshKey={goalRefreshKey} compact />

      <CollapsibleBlock title="My running shoes" theme={theme} defaultOpen>
        <RunningShoesPanel userId={userId} shoes={runningShoes} onChange={onRunningShoesChange} theme={theme} />
      </CollapsibleBlock>

      {stravaInsights?.connected ? (
        <CollapsibleBlock title="Strava insights" theme={theme} defaultOpen>
          <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
            <div className="run-dash-mini-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              <MiniStat label="Strava runs" value={`${stravaInsights.runCount || 0}`} sub={`${stravaInsights.totalDistanceKm || 0} km total`} accent="#fc5200" theme={theme} />
              <MiniStat label="Max speed" value={stravaInsights.maxSpeedKmh ? `${stravaInsights.maxSpeedKmh} km/h` : '--'} sub="from GPS" accent={theme.green} theme={theme} />
              <MiniStat label="Best pace" value={stravaInsights.bestPaceMinPerKm ? fmtPace(stravaInsights.bestPaceMinPerKm) : '--'} sub={stravaInsights.bestPaceRun ? fmtDate(stravaInsights.bestPaceRun.date) : 'min/km'} accent={theme.cyan} theme={theme} />
              <MiniStat label="Elevation" value={`${stravaInsights.elevationGainM || 0} m`} sub="total climb" accent={theme.purple} theme={theme} />
              <MiniStat label="Avg heart rate" value={stravaInsights.avgHeartRate ? `${stravaInsights.avgHeartRate} bpm` : '--'} sub={stravaInsights.maxHeartRate ? `max ${stravaInsights.maxHeartRate} bpm` : 'from Strava'} accent="#f43f5e" theme={theme} />
              <MiniStat label="Avg speed" value={stravaInsights.avgSpeedKmh ? `${stravaInsights.avgSpeedKmh} km/h` : '--'} sub="moving average" accent={theme.orange} theme={theme} />
              <MiniStat label="Longest run" value={stravaInsights.longestRunKm ? `${stravaInsights.longestRunKm} km` : '--'} sub={stravaInsights.longestRun ? fmtDate(stravaInsights.longestRun.date) : 'distance'} accent={theme.blue} theme={theme} />
            </div>
            {(stravaInsights.paceByMinuteBuckets || []).some((b) => b.count > 0) ? (
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>Pace by minutes (Strava)</div>
                {(stravaInsights.paceByMinuteBuckets || []).map((bucket) => (
                  <div key={bucket.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{bucket.label}</span>
                    <div style={{ height: 8, borderRadius: 999, background: `${theme.cardBorder}`, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, (bucket.count / Math.max(1, stravaInsights.runCount)) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#fc5200,#f97316)' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>{bucket.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {(stravaInsights.fastestRuns || []).length ? (
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 14, color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>Highest max speeds (Strava)</div>
                {stravaInsights.fastestRuns.slice(0, 6).map((run, index) => (
                  <div key={`${run.id || run.date}-${index}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 10, padding: '11px 18px', borderTop: index > 0 ? `1px solid ${theme.cardBorder}` : 'none', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: index === 0 ? '#fc5200' : theme.textMuted }}>#{index + 1}</span>
                    <span style={{ fontSize: 12, color: theme.textSecondary }}>{fmtDate(run.date)} · {run.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.green }}>{run.maxSpeedKmh} km/h</span>
                    <span style={{ fontSize: 11, color: theme.textMuted }}>{run.distanceKm} km · {fmtPace(run.paceMinPerKm)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {(stravaInsights.recentRuns || []).length ? (
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 14, color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>Recent Strava runs</div>
                {stravaInsights.recentRuns.slice(0, 8).map((run, index) => (
                  <div key={`recent-${run.id || run.date}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '11px 18px', borderTop: index > 0 ? `1px solid ${theme.cardBorder}` : 'none', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.textHeading }}>{run.name || 'Run'}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                        {fmtDate(run.date)} · {run.distanceKm} km · {fmtPace(run.paceMinPerKm)}
                        {run.elevationGainM ? ` · ↑${run.elevationGainM}m` : ''}
                        {run.maxSpeedKmh ? ` · max ${run.maxSpeedKmh} km/h` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fc5200' }}>{run.minutes} min</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CollapsibleBlock>
      ) : (
        <div style={{ borderRadius: 18, border: `1px dashed ${theme.cardBorder}`, padding: 16, color: theme.textMuted, fontSize: 13 }}>
          Connect Strava on the Wellness page to import GPS max speed, pace buckets, and elevation here.
        </div>
      )}

      {noData ? <EmptyState sport="Running" theme={theme} /> : (
      <>
      <CollapsibleBlock title="Performance dashboards" theme={theme} defaultOpen>
        <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
          <div className="run-dash-mini-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <MiniStat label="7-day km" value={`${insights.km7.toFixed(1)} km`} sub={`${insights.runs7} runs`} accent={theme.orange} theme={theme} />
            <MiniStat label="30-day km" value={`${insights.km30.toFixed(1)} km`} sub={`${insights.runs30} runs`} accent={theme.blue} theme={theme} />
            <MiniStat label="Pace (7d)" value={insights.avgPace7 ? fmtPace(insights.avgPace7) : '--'} sub={paceDelta != null ? `${paceDelta < 0 ? 'Faster' : 'Slower'} vs 30d` : '—'} accent={paceDelta != null && paceDelta < 0 ? theme.green : theme.cyan} theme={theme} />
            <MiniStat label="Pace (30d)" value={insights.avgPace30 ? fmtPace(insights.avgPace30) : '--'} sub="rolling average" accent={theme.purple} theme={theme} />
          </div>
          <div className="run-dash-charts-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <RecentRunsChart runs={insights.recentRuns} theme={theme} />
            <MonthlyVolumeChart months={insights.months} theme={theme} />
          </div>
          {runRows.length > 1 && (
            <div className="run-dash-charts-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <PaceTrendChart runRows={runRows} theme={theme} />
              <WeeklyMileageChart runRows={runRows} theme={theme} />
            </div>
          )}
          <div className="run-dash-charts-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SpeedTrendChart runRows={runRows} theme={theme} />
            <LongRunTrendChart months={insights.months} theme={theme} />
          </div>
          <WeekdayPatternChart weekdayKm={insights.weekdayKm} weekdayLabels={insights.weekdayLabels} theme={theme} />
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Key run metrics" theme={theme} defaultOpen>
      <div className="sport-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px', marginTop: 4 }}>
        <HeroStat label="Total Distance" value={`${runStats.totalDistance} km`} sub={`${runStats.totalRuns} runs`} accent={theme.blue} theme={theme} />
        <HeroStat label="Fastest Speed" value={`${runStats.fastestSpeed ?? '--'} km/h`} sub={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.distance} km · ${fmtDate(runStats.fastestSpeedRun.date)}` : null} accent={theme.green} theme={theme} />
        <HeroStat label="Average Speed" value={`${runStats.averageSpeed} km/h`} sub={runStats.averagePace ? `Pace: ${fmtPace(runStats.averagePace)}` : null} accent={theme.cyan} theme={theme} />
        <HeroStat label="Best Wellness" value={wellStats?.highestScore ? `${wellStats.highestScore.score.toFixed(0)} pts` : '--'} sub={wellStats?.highestScore ? fmtDate(wellStats.highestScore.date) : null} accent={theme.orange} theme={theme} />
      </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Records & streaks" theme={theme} defaultOpen>
        <div className="sport-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px', marginTop: 4 }}>
          <RecordCard label="Fastest Speed" value={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.speed} km/h` : null} detail1={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.distance} km in ${runStats.fastestSpeedRun.time}` : null} detail2={runStats.fastestSpeedRun ? fmtDate(runStats.fastestSpeedRun.date) : null} accent={theme.green} theme={theme} />
          <RecordCard label="Longest Run" value={runStats.longestDistanceRun ? `${runStats.longestDistanceRun.distance} km` : null} detail1={runStats.longestDistanceRun ? `${runStats.longestDistanceRun.time} · ${runStats.longestDistanceRun.speed} km/h` : null} detail2={runStats.longestDistanceRun ? fmtDate(runStats.longestDistanceRun.date) : null} accent={theme.blue} theme={theme} />
          <RecordCard label="Best Pace" value={runStats.fastestSpeedRun ? fmtPace(60 / runStats.fastestSpeedRun.speed) : null} detail1={runStats.fastestSpeedRun ? `${runStats.fastestSpeedRun.speed} km/h on ${fmtDate(runStats.fastestSpeedRun.date)}` : null} detail2="Pace = minutes per km" accent={theme.cyan} theme={theme} />
        </div>
        {wellSummary && (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <RecordCard label={`${name}'s streak`} value={`${wellSummary.runningStreak} days`} detail1={`Best ${wellSummary.longestRunningStreak} days`} accent={theme.orange} theme={theme} />
            <RecordCard label="Week km" value={wellSummary.dashboardStats?.weeklyRunningKm ? `${Number(wellSummary.dashboardStats.weeklyRunningKm).toFixed(1)} km` : '--'} detail1={`Total ${runStats.totalDistance} km`} accent={theme.emerald} theme={theme} />
          </div>
        )}
      </CollapsibleBlock>

      <CollapsibleBlock title="Top runs & history" theme={theme} defaultOpen>
        <div className="sport-2col" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: 4 }}>
          <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: '14px', color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>{name}&apos;s Fastest Runs (min 2 km)</div>
            {(runStats.topSpeeds || []).slice(0, 7).map((e, i) => (
              <div key={`${e.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr auto', gap: '10px', padding: '11px 18px', borderTop: i > 0 ? `1px solid ${theme.cardBorder}` : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: i === 0 ? theme.orange : theme.textMuted }}>#{i + 1}</span>
                <span style={{ fontSize: '12px', color: theme.textSecondary }}>{fmtDate(e.date)}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: theme.green }}>{e.speed} km/h</span>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>{e.distance} km in {e.time}</span>
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
      </CollapsibleBlock>

      <CollapsibleBlock title="Shoe analytics" theme={theme} defaultOpen={false}>
        <ShoeStatsSection entries={entries} shoes={runningShoes} theme={theme} />
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
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('running');
  const [showMarathonModal, setShowMarathonModal] = useState(false);
  const [goalRefreshKey, setGoalRefreshKey] = useState(0);
  const [showOtherSports, setShowOtherSports] = useState(false);
  const [runningShoes, setRunningShoes] = useState([]);
  const [stravaInsights, setStravaInsights] = useState(null);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

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
    if (!user?.id) return undefined;
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
    let cancelled = false;
    fetch(`${API_BASE}/wellness/strava/insights/${encodeURIComponent(user.id)}?days=90`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setStravaInsights(payload);
      })
      .catch(() => {
        if (!cancelled) setStravaInsights(null);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const runStats = useMemo(() => (user?.id ? computeRunningStats(user.id) : null), [user?.id]);
  const wellStats = useMemo(() => (user?.id ? computeWellnessStats(user.id) : null), [user?.id]);
  const wellSummary = useMemo(() => (user?.id ? buildWellnessSummary(user.id) : null), [user?.id]);

  const entries = useMemo(() => wellSummary?.entries || [], [wellSummary]);
  const runRows = useMemo(() => buildRunningRows(entries), [entries]);

  const allSportStats = useMemo(() => ({
    running: computeSportStats(entries, 'runningMinutes', 'runningDistanceKm'),
    badminton: computeSportStats(entries, 'badmintonMinutes'),
    yoga: computeSportStats(entries, 'yogaMinutes'),
    cycling: computeSportStats(entries, 'cyclingMinutes'),
    walking: computeSportStats(entries, 'walkingMinutes', 'walkingDistanceKm'),
    swimming: computeSportStats(entries, 'swimmingMinutes'),
  }), [entries]);

  const name = user?.name || user?.username || 'Athlete';

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
          background: rgba(15,23,42,0.35);
          border: 1px solid rgba(148,163,184,0.18);
          overflow-x: auto;
        }
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
        @media (max-width: 560px) {
          .running-analytics-page { padding: 12px 12px 0 !important; }
          .sport-4col { grid-template-columns: 1fr !important; }
          .sport-3col { grid-template-columns: 1fr !important; }
          .marathon-metric-grid { grid-template-columns: 1fr !important; }
          .sport-tab-strip { flex-wrap: nowrap !important; }
          .sport-tab-btn { flex: 0 0 auto; }
          .marathon-modal-backdrop { align-items: flex-end !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '20px' }}>

        <div className="run-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '16px', borderRadius: '20px', background: `linear-gradient(135deg, ${theme.orange}14, ${theme.cyan}10, ${theme.cardBg})`, border: `1px solid ${theme.cardBorder}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted }}>Running</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(20px,4vw,26px)', fontWeight: 900, color: theme.textHeading, lineHeight: 1.1 }}>Race cockpit</h1>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: theme.textSecondary }}>{runStats?.totalRuns || 0} runs · goal-based plan</p>
          </div>
          <button type="button" onClick={() => setShowMarathonModal(true)} style={{ border: 'none', background: theme.orange, color: '#fff', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontWeight: 800, fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>🏁 Goal</button>
        </div>

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
            userId={user?.id}
            onOpenMarathonPlan={() => setShowMarathonModal(true)}
            goalRefreshKey={goalRefreshKey}
            stravaInsights={stravaInsights}
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
