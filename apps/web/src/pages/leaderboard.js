import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { resolveAvatarPresentation } from '../lib/avatarProfile';

// ─── helpers ─────────────────────────────────────────────
function fmtNum(value, dec = 1) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(dec) : '0';
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMins(mins) {
  const m = Number(mins || 0);
  if (!m) return '--';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

function sortDailyScoresByDate(dailyScores = []) {
  return [...(Array.isArray(dailyScores) ? dailyScores : [])].sort(
    (a, b) => String(a.date || '').localeCompare(String(b.date || ''))
  );
}

function computeLatestCumulativeScore(dailyScores = []) {
  const ordered = sortDailyScoresByDate(dailyScores);
  const latest = ordered[ordered.length - 1];
  if (!latest) return 0;
  const direct = Number(latest.cumulativeTotalScore || 0);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  return ordered.reduce((sum, s) => sum + Number(s.totalScore || 0), 0);
}

// ─── tooltip ──────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && text && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,0.85)', color: '#fff',
          padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
          pointerEvents: 'none', zIndex: 99,
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── mini spark line ──────────────────────────────────────
function Spark({ series, max, color }) {
  const W = 120, H = 32;
  if (!series?.length) return <span style={{ fontSize: '11px', color: '#666' }}>—</span>;
  const pts = series.map((p, i) => {
    const x = series.length <= 1 ? W / 2 : (i / (series.length - 1)) * W;
    const y = H - ((Number(p.cumulative || 0) / Math.max(1, max)) * (H - 6)) - 3;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />
    </svg>
  );
}

// ─── rank badge ───────────────────────────────────────────
function RankBadge({ rank }) {
  const colors = ['#f59e0b', '#9ca3af', '#b45309'];
  const labels = ['🥇', '🥈', '🥉'];
  if (rank <= 3) return <span style={{ fontSize: '20px' }}>{labels[rank - 1]}</span>;
  return <span style={{ fontWeight: 800, fontSize: '14px', color: '#6b7280' }}>{rank}</span>;
}

function AvatarChip({ user, size = 40, theme }) {
  const avatar = resolveAvatarPresentation(user?.avatar || '');
  const fallback = String(user?.name || user?.username || 'U').slice(0, 1).toUpperCase();
  const frame = avatar.activeFrame || { x: 0, y: 0, scale: 1 };

  if (avatar.displaySrc) {
    if (avatar.isCutout) {
      const cutoutWidth = avatar.mode === 'body' ? size * 0.94 : size * 0.8;
      const cutoutHeight = avatar.mode === 'body' ? size * 1.3 : size * 0.96;
      return (
        <div style={{ width: size, height: size, position: 'relative', borderRadius: Math.round(size * 0.34), background: `linear-gradient(180deg, ${theme.panelBg || theme.cardBg}, ${theme.cardBg})`, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: '18% 18% auto', height: '58%', borderRadius: '999px', background: `${theme.cyan}18`, filter: 'blur(10px)' }} />
          <div style={{ position: 'absolute', left: '50%', bottom: '12%', width: '54%', height: '10%', borderRadius: '999px', background: `${theme.shadow}55`, filter: 'blur(8px)', transform: 'translateX(-50%)' }} />
          <img
            src={avatar.displaySrc}
            alt={user?.name || user?.username || 'Profile'}
            style={{
              position: 'absolute',
              left: '50%',
              top: avatar.mode === 'body' ? '10%' : '8%',
              width: cutoutWidth,
              height: cutoutHeight,
              objectFit: 'contain',
              objectPosition: 'center top',
              transform: `translateX(calc(-50% + ${frame.x * 0.22}%)) translateY(${frame.y * 0.22}%) scale(${Math.min(frame.scale, 1.28)})`,
              transformOrigin: 'center top',
              filter: `drop-shadow(0 10px 16px ${theme.shadow})`,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        </div>
      );
    }

    return (
      <img
        src={avatar.displaySrc}
        alt={user?.name || user?.username || 'Profile'}
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.34), objectFit: 'cover', border: `1px solid ${theme.cardBorder}`, flexShrink: 0 }}
      />
    );
  }

  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.34), display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${theme.orange}, ${theme.blue})`, color: '#fff', fontWeight: 800, fontSize: Math.max(12, size * 0.32), border: `1px solid ${theme.cardBorder}`, flexShrink: 0 }}>
      {fallback}
    </div>
  );
}

// ─── leaderboard row ──────────────────────────────────────
function LbRow({ entry, rank, chartMax, selfName, theme }) {
  const isMe = entry.isSelf;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 1fr 120px 130px',
      gap: '10px', padding: '13px 18px',
      borderTop: `1px solid ${theme.cardBorder}`,
      alignItems: 'center',
      background: isMe ? `${theme.orange}08` : 'transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><RankBadge rank={rank} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
          <AvatarChip user={entry} size={40} theme={theme} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'center', minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '14px', color: theme.textHeading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isMe ? selfName : entry.name}
              </span>
              {isMe && <span style={{ fontSize: '10px', fontWeight: 700, borderRadius: '999px', padding: '2px 8px', color: '#bbf7d0', background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.34)', flexShrink: 0 }}>You</span>}
            </div>
            <div style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.planName} · {entry.days}d
            </div>
          </div>
        </div>
      </div>
      <span style={{ fontWeight: 700, fontSize: '15px', color: theme.green, textAlign: 'right' }}>
        {fmtNum(entry.cumulativeTotal, 0)}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Spark series={entry.series} max={chartMax} color={isMe ? (theme.orange || '#f97316') : (theme.blue || '#3b82f6')} />
      </div>
    </div>
  );
}

// ─── sport leaderboard card ───────────────────────────────
function SportBoard({ title, entries, valueKey, valueSuffix, color, theme, selfName }) {
  if (!entries?.length) {
    return (
      <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', padding: '20px' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: theme.textHeading, marginBottom: '10px' }}>{title}</div>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>No data yet.</div>
      </div>
    );
  }
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: '14px', color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>{title}</div>
      {entries.slice(0, 8).map((entry, i) => (
        <div key={`${entry.name}-${entry.date}-${i}`} style={{
          display: 'grid', gridTemplateColumns: '28px 1fr auto',
          gap: '10px', padding: '10px 18px',
          borderTop: i > 0 ? `1px solid ${theme.cardBorder}` : 'none',
          alignItems: 'center',
          background: entry.isSelf ? `${theme.orange}08` : 'transparent',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: i === 0 ? theme.orange : theme.textMuted }}>#{i + 1}</span>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AvatarChip user={entry} size={32} theme={theme} />
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: theme.textHeading }}>
                {entry.isSelf ? selfName : entry.name}
              </span>
              <Tooltip text={fmtDate(entry.date)}>
                <span style={{ fontSize: '11px', color: theme.textSecondary, marginLeft: '6px', cursor: 'default', borderBottom: `1px dotted ${theme.textMuted}` }}>
                  {entry.date ? entry.date.slice(5) : ''}
                </span>
              </Tooltip>
            </div>
          </div>
          <span style={{ fontWeight: 700, fontSize: '14px', color }}>
            {fmtNum(entry[valueKey])} {valueSuffix}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── me vs them comparison ────────────────────────────────
function CompareCard({ meRow, themRow, label, valueKey, valueSuffix, theme, selfName }) {
  const meVal = Number(meRow?.[valueKey] || 0);
  const themVal = Number(themRow?.[valueKey] || 0);
  const max = Math.max(1, meVal, themVal);
  const meLeads = meVal >= themVal;
  return (
    <div style={{ padding: '16px 18px', borderRadius: '16px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, marginBottom: '10px' }}>{label}</div>
      {[
        { name: selfName, val: meVal, isMe: true, avatar: meRow?.avatar || '' },
        { name: themRow?.name || 'Leader', val: themVal, isMe: false, avatar: themRow?.avatar || '' },
      ].map((p) => (
        <div key={p.name} style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <AvatarChip user={{ ...p, username: p.name }} size={36} theme={theme} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: p.isMe ? (meLeads ? theme.green : theme.orange) : theme.blue }}>
              {fmtNum(p.val)} {valueSuffix}
            </span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: theme.cardBorder, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(p.val / max) * 100}%`, background: p.isMe ? (meLeads ? theme.green : theme.orange) : theme.blue, borderRadius: '3px', transition: 'width 0.5s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────
const LEADER_TABS = [
  { id: 'overall', label: 'Overall', emoji: '🏆' },
  { id: 'running', label: 'Running', emoji: '🏃' },
  { id: 'badminton', label: 'Badminton', emoji: '🏸' },
  { id: 'cycling', label: 'Cycling', emoji: '🚴' },
];

export default function Leaderboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [activeTab, setActiveTab] = useState('overall');

  useEffect(() => { restoreUserSession(router, setUser); }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const selfUserId = String(user?.id || user?.email || user?.username || '').trim();
      const selfUsername = String(user?.username || '').trim();
      if (!selfUserId || !selfUsername) { setRows([]); setLoading(false); return; }
      setLoading(true);
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        const chatBase = isLocal ? `http://${host}:3002/chat` : '/chat-api/chat';
        const wellBase = isLocal ? `http://${host}:3004` : '';

        const bootstrap = await fetch(`${chatBase}/bootstrap?username=${encodeURIComponent(selfUsername)}`);
        const bsData = await bootstrap.json().catch(() => ({}));
        const friends = Array.isArray(bsData?.friends) ? bsData.friends : [];

        const buddyLookups = await Promise.all(friends.map(async (username) => {
          const n = String(username || '').trim();
          if (!n) return null;
          try {
            const res = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(n)}`);
            const data = await res.json();
            const match = (Array.isArray(data?.results) ? data.results : [])
              .find((e) => String(e?.username || '').toLowerCase() === n.toLowerCase());
            return {
              username: n,
              displayName: String(match?.name || match?.username || n).trim(),
              userId: String(match?.id || match?.email || match?.username || n).trim(),
              avatar: String(match?.avatar || ''),
              isSelf: false,
            };
          } catch { return { username: n, displayName: n, userId: n, avatar: '', isSelf: false }; }
        }));

        const participants = [
          { username: selfUsername, displayName: String(user?.name || user?.username || selfUsername), userId: selfUserId, avatar: String(user?.avatar || ''), isSelf: true },
          ...buddyLookups.filter(Boolean),
        ];
        const unique = Array.from(new Map(participants.map((p) => [String(p.userId).toLowerCase(), p])).values());

        const leaderboardRows = await Promise.all(unique.map(async (participant) => {
          try {
            const res = await fetch(`${wellBase}/wellness/data/${encodeURIComponent(participant.userId)}`);
            const data = await res.json();
            if (!res.ok || !data?.plan || data.plan.status !== 'active') return null;
            const sorted = sortDailyScoresByDate(data.dailyScores || []);
            const latest = sorted[sorted.length - 1] || null;
            const entries = Array.isArray(data.entries) ? data.entries : [];

            // build per-sport run entries
            const runEntries = entries
              .filter((e) => Number(e.runningDistanceKm || 0) > 0 && Number(e.runningMinutes || 0) > 0)
              .map((e) => ({
                date: e.date,
                name: participant.displayName, username: participant.username, avatar: participant.avatar, isSelf: participant.isSelf,
                distance: Number(e.runningDistanceKm),
                minutes: Number(e.runningMinutes),
                speed: Number((Number(e.runningDistanceKm) / (Number(e.runningMinutes) / 60)).toFixed(2)),
              }));

            const badmintonEntries = entries
              .filter((e) => Number(e.badmintonMinutes || 0) > 0)
              .map((e) => ({ date: e.date, name: participant.displayName, username: participant.username, avatar: participant.avatar, isSelf: participant.isSelf, minutes: Number(e.badmintonMinutes) }));

            const cyclingEntries = entries
              .filter((e) => Number(e.cyclingMinutes || 0) > 0)
              .map((e) => ({ date: e.date, name: participant.displayName, username: participant.username, avatar: participant.avatar, isSelf: participant.isSelf, minutes: Number(e.cyclingMinutes) }));

            return {
              id: participant.userId,
              name: participant.displayName,
              username: participant.username,
              avatar: participant.avatar,
              isSelf: participant.isSelf,
              planName: String(data.plan.name || 'Active plan'),
              days: sorted.length,
              cumulativeTotal: computeLatestCumulativeScore(sorted),
              lastDayScore: Number(latest?.totalScore || 0),
              series: sorted.map((s) => ({ date: s.date, cumulative: Number(s.cumulativeTotalScore || 0) })),
              runEntries,
              badmintonEntries,
              cyclingEntries,
              totalRunKm: runEntries.reduce((s, e) => s + e.distance, 0),
              totalBadmintonMins: badmintonEntries.reduce((s, e) => s + e.minutes, 0),
              totalCyclingMins: cyclingEntries.reduce((s, e) => s + e.minutes, 0),
            };
          } catch { return null; }
        }));

        if (!cancelled) {
          setRows(
            leaderboardRows.filter(Boolean)
              .sort((a, b) => Number(b.cumulativeTotal) - Number(a.cumulativeTotal))
          );
        }
      } catch { if (!cancelled) setRows([]); }
      if (!cancelled) setLoading(false);
    }
    if (user) load();
    return () => { cancelled = true; };
  }, [user?.id, user?.email, user?.username, user?.name]);

  const selfName = user?.name || user?.username || 'You';

  const chartMax = useMemo(() => {
    const max = rows.reduce((best, row) => {
      const rowMax = (row.series || []).reduce((rb, p) => Math.max(rb, Number(p.cumulative || 0)), 0);
      return Math.max(best, rowMax, Number(row.cumulativeTotal || 0));
    }, 0);
    return Math.max(1, max);
  }, [rows]);

  // Sport leaderboard arrays
  const topRunDistance = useMemo(() =>
    rows.flatMap((r) => r.runEntries || [])
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 10),
    [rows]);

  const topRunSpeed = useMemo(() =>
    rows.flatMap((r) => r.runEntries || [])
      .filter((e) => e.distance >= 2)
      .sort((a, b) => b.speed - a.speed)
      .slice(0, 10),
    [rows]);

  const topBadminton = useMemo(() =>
    rows.flatMap((r) => r.badmintonEntries || [])
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10),
    [rows]);

  const topCycling = useMemo(() =>
    rows.flatMap((r) => r.cyclingEntries || [])
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10),
    [rows]);

  // Compare: me vs #1 (if I'm not #1)
  const meRow = useMemo(() => rows.find((r) => r.isSelf), [rows]);
  const leaderRow = useMemo(() => rows.find((r) => !r.isSelf) || rows[0], [rows]);

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, padding: '24px', fontFamily: theme.font }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        @media (max-width: 760px) {
          .lb-main-row { grid-template-columns: 44px 1fr 90px !important; }
          .lb-spark { display: none !important; }
          .lb-2col { grid-template-columns: 1fr !important; }
          .lb-3col { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 500px) {
          .lb-3col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gap: '20px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', padding: '22px 24px', borderRadius: '24px', background: theme.panelBg || theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.textMuted, marginBottom: '6px' }}>Friends</div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: theme.textHeading, lineHeight: 1.1 }}>Buddy Leaderboard</h1>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: theme.textSecondary }}>
              {rows.length} active participant{rows.length !== 1 ? 's' : ''} · Cumulative wellness score ranking
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => router.push('/running-analytics')} style={{ background: theme.btnSecondaryBg || theme.cardBg, color: theme.btnSecondaryText || theme.textPrimary, border: `1px solid ${theme.cardBorder}`, borderRadius: '12px', padding: '9px 15px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>My Stats</button>
            <button onClick={() => router.push('/dashboard')} style={{ background: theme.orange, color: '#fff', border: 'none', borderRadius: '12px', padding: '9px 15px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Dashboard</button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {LEADER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '10px 18px', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                border: isActive ? `1px solid ${theme.orange}` : `1px solid ${theme.cardBorder}`,
                background: isActive ? `${theme.orange}18` : theme.cardBg,
                color: isActive ? theme.orange : theme.textSecondary,
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.15s',
              }}>
                <span>{tab.emoji}</span><span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: theme.textSecondary, borderRadius: '18px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
            Loading buddy data...
          </div>
        ) : !rows.length ? (
          <div style={{ padding: '48px', textAlign: 'center', color: theme.textSecondary, borderRadius: '18px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
            No active plans found. Add buddies and log wellness data to compete!
          </div>
        ) : (
          <>
            {/* ── Me vs Leader comparison (show only if >1 participant) ── */}
            {meRow && leaderRow && meRow.id !== leaderRow.id && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: theme.textMuted, marginBottom: '12px' }}>
                  {selfName} vs {leaderRow.name}
                </div>
                <div className="lb-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px' }}>
                  <CompareCard meRow={meRow} themRow={leaderRow} label="Cumulative Score" valueKey="cumulativeTotal" valueSuffix="pts" theme={theme} selfName={selfName} />
                  <CompareCard meRow={meRow} themRow={leaderRow} label="Total Running Distance" valueKey="totalRunKm" valueSuffix="km" theme={theme} selfName={selfName} />
                  <CompareCard meRow={meRow} themRow={leaderRow} label="Badminton Minutes" valueKey="totalBadmintonMins" valueSuffix="min" theme={theme} selfName={selfName} />
                </div>
              </div>
            )}

            {/* ── Overall tab: main ranking ── */}
            {activeTab === 'overall' && (
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 120px 130px', gap: '10px', padding: '12px 18px', background: theme.cardBgAlt || theme.pageBgSolid || theme.cardBg, color: theme.textMuted, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  <span style={{ textAlign: 'center' }}>#</span>
                  <span>Name</span>
                  <span style={{ textAlign: 'right' }}>Score</span>
                  <span className="lb-spark" style={{ textAlign: 'right' }}>Trend</span>
                </div>
                {rows.slice(0, 15).map((entry, i) => (
                  <LbRow key={entry.id} entry={entry} rank={i + 1} chartMax={chartMax} selfName={selfName} theme={theme} />
                ))}
              </div>
            )}

            {/* ── Running tab ── */}
            {activeTab === 'running' && (
              <div className="lb-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <SportBoard title="Longest Runs" entries={topRunDistance} valueKey="distance" valueSuffix="km" color={theme.blue} theme={theme} selfName={selfName} />
                <SportBoard title="Fastest Runs (min 2 km)" entries={topRunSpeed} valueKey="speed" valueSuffix="km/h" color={theme.green} theme={theme} selfName={selfName} />
              </div>
            )}

            {/* ── Badminton tab ── */}
            {activeTab === 'badminton' && (
              <SportBoard title="Longest Badminton Sessions" entries={topBadminton} valueKey="minutes" valueSuffix="min" color={theme.yellow || '#eab308'} theme={theme} selfName={selfName} />
            )}

            {/* ── Cycling tab ── */}
            {activeTab === 'cycling' && (
              <SportBoard title="Longest Cycling Sessions" entries={topCycling} valueKey="minutes" valueSuffix="min" color={theme.cyan} theme={theme} selfName={selfName} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
