import { useMemo } from 'react';
import {
  buildGoalTrainingBlocks,
  distanceLabel,
  formatGoalPace,
  getActiveGoal,
  getLatestCompletedGoal,
} from './marathonReadiness';

export function GoalScopeBar({
  book,
  selectedId,
  onChange,
  theme,
}) {
  const goals = book?.goals || [];
  if (!goals.length) {
    return (
      <div style={{
        padding: '10px 12px',
        borderRadius: 14,
        border: `1px dashed ${theme.cardBorder}`,
        color: theme.textMuted,
        fontSize: 12,
      }}
      >
        Add a race goal to scope Pulse, volume, and speed to that block.
      </div>
    );
  }
  return (
    <label style={{
      display: 'grid',
      gap: 6,
      padding: '10px 12px',
      borderRadius: 14,
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      minWidth: 0,
    }}
    >
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.textMuted }}>
        Goal
      </span>
      <select
        value={selectedId || goals[0].id}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label="Selected race goal"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${theme.orange || '#fb923c'}55`,
          background: theme.inputBg || 'rgba(2,6,23,0.72)',
          color: theme.textHeading,
          fontSize: 14,
          fontWeight: 800,
          cursor: 'pointer',
          colorScheme: 'dark',
        }}
      >
        {goals.map((goal) => (
          <option key={goal.id} value={goal.id}>
            {distanceLabel(goal.distanceKm)} · {fmtDate(goal.raceDate)}
            {goal.status === 'completed' ? ' · done' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Stat({ label, value, theme }) {
  return (
    <div style={{
      minWidth: 0,
      padding: '10px 12px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${theme.cardBorder}`,
    }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: theme.textHeading, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export function RaceGoalsStudio({
  book,
  runRows = [],
  theme,
  onOpenPlan,
}) {
  const blocks = useMemo(
    () => buildGoalTrainingBlocks({ goals: book?.goals || [], runs: runRows }),
    [book, runRows],
  );
  const active = getActiveGoal(book);
  const lastDone = getLatestCompletedGoal(book);

  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      {!active ? (
        <button
          type="button"
          onClick={onOpenPlan}
          style={{
            width: '100%',
            textAlign: 'left',
            border: `1px solid ${theme.orange}55`,
            borderRadius: 18,
            padding: 14,
            background: `linear-gradient(135deg, ${theme.orange}22, ${theme.cyan}12)`,
            color: theme.textHeading,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>Select your next race goal</div>
          <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6, lineHeight: 1.45 }}>
            {lastDone
              ? `${lastDone.distanceKm} km on ${fmtDate(lastDone.raceDate)} is done. Pick the next distance before Cosmix scores a new block.`
              : '10K, 21.2 km half, or 42.2 km full — metrics stay on the goal they belong to.'}
          </div>
        </button>
      ) : (
        <div style={{
          borderRadius: 16,
          padding: 12,
          border: `1px solid ${theme.orange}44`,
          background: `${theme.orange}12`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          alignItems: 'center',
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.orange }}>Current goal</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{distanceLabel(active.distanceKm)} · {fmtDate(active.raceDate)}</div>
          </div>
          <button
            type="button"
            onClick={onOpenPlan}
            style={{ border: 'none', background: theme.orange, color: '#fff', borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          >
            Change
          </button>
        </div>
      )}

      {blocks.map((block) => (
        <section
          key={block.id}
          style={{
            borderRadius: 18,
            padding: 14,
            border: `1px solid ${block.status === 'active' ? `${theme.orange}55` : theme.cardBorder}`,
            background: theme.cardBg,
            display: 'grid',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted }}>
              {block.emoji} {block.status === 'completed' ? 'Completed' : block.status === 'active' ? 'Training now' : 'Not assigned yet'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: theme.textHeading, marginTop: 4 }}>
              {block.label}
            </div>
            <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
              {fmtDate(block.start)} → {fmtDate(block.end)}
              {block.distanceKm > 0 ? ` · race ${block.distanceKm} km` : ''}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <Stat label="Runs" value={block.stats.runCount} theme={theme} />
            <Stat label="Distance" value={`${block.stats.km} km`} theme={theme} />
            <Stat label="Avg pace" value={formatGoalPace(block.stats.avgPace)} theme={theme} />
            <Stat label="Avg HR" value={block.stats.avgHeartrate ? `${block.stats.avgHeartrate} bpm` : '--'} theme={theme} />
            <Stat
              label="Avg speed"
              value={block.stats.avgSpeed ? `${Number(block.stats.avgSpeed).toFixed(1)} km/h` : '--'}
              theme={theme}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
