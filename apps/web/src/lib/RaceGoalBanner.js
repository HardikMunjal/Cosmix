import { useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  MARATHON_GOAL_PRESETS,
  buildMarathonReadiness,
  distanceLabel,
  ensureRaceGoalBook,
  getActiveGoal,
  getLatestCompletedGoal,
} from './marathonReadiness';

export function RaceGoalBanner({ userId, entries = [], glassStyle }) {
  const router = useRouter();
  const runRows = useMemo(() => (
    (Array.isArray(entries) ? entries : [])
      .filter((e) => Number(e.runningDistanceKm || 0) > 0 && Number(e.runningMinutes || 0) > 0)
      .map((e) => ({
        date: e.date,
        distance: Number(e.runningDistanceKm),
        minutes: Number(e.runningMinutes),
      }))
  ), [entries]);
  const savedGoal = userId ? getActiveGoal(ensureRaceGoalBook(userId, runRows)) : null;
  const lastDone = userId ? getLatestCompletedGoal(ensureRaceGoalBook(userId, runRows)) : null;

  const readiness = useMemo(() => buildMarathonReadiness({
    runs: runRows,
    goalDistanceKm: savedGoal?.distanceKm,
    raceDate: savedGoal?.raceDate || null,
    sinceDate: savedGoal?.startedAt || lastDone?.raceDate || null,
  }), [runRows, savedGoal, lastDone]);

  const preset = MARATHON_GOAL_PRESETS.find((p) => p.id === savedGoal?.presetId);

  function openRunning(setup = false) {
    router.push(setup ? '/running-analytics?setup=1' : '/running-analytics');
  }

  if (!savedGoal) {
    return (
      <button
        type="button"
        onClick={() => openRunning(true)}
        style={{
          ...glassStyle,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid rgba(251,113,133,0.35)',
          background: 'linear-gradient(135deg, rgba(251,113,133,0.18), rgba(56,189,248,0.10))',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 28 }} aria-hidden="true">🏁</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>Select your next race goal</span>
          <span style={{ display: 'block', fontSize: 12, opacity: 0.82, marginTop: 4 }}>
            {lastDone ? `${distanceLabel(lastDone.distanceKm)} is done — pick the next one` : '10K, 21.2 km half, or 42.2 km full'}
          </span>
        </span>
        <span style={{ fontWeight: 800, fontSize: 18, opacity: 0.7 }}>›</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openRunning(false)}
      style={{
        ...glassStyle,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '12px 14px',
        borderRadius: 14,
        border: `1px solid ${readiness.readinessColor}44`,
        background: `linear-gradient(135deg, ${readiness.readinessColor}18, rgba(255,255,255,0.04))`,
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: `conic-gradient(${readiness.readinessColor} ${readiness.readinessPercent}%, rgba(255,255,255,0.1) 0)`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(20,10,30,0.85)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 900 }}>
            {readiness.readinessPercent}%
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75 }}>Race goal</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{preset?.emoji || '🏃'} {distanceLabel(savedGoal.distanceKm)}</div>
          <div style={{ fontSize: 12, opacity: 0.82, marginTop: 4 }}>
            Finish ~{readiness.predictedFinishDisplay} · {readiness.daysUntilRace != null ? `${readiness.daysUntilRace}d left` : 'Open stats'}
          </div>
        </div>
        <span style={{ fontWeight: 800, fontSize: 18, opacity: 0.7 }}>›</span>
      </div>
    </button>
  );
}
