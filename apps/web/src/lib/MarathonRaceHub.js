import { useEffect, useMemo, useState } from 'react';
import {
  MARATHON_GOAL_PRESETS,
  buildMarathonReadiness,
  loadMarathonGoal,
  saveMarathonGoal,
} from './marathonReadiness';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ReadinessRing({ percent, color, label, theme, size = 148 }) {
  const stroke = Math.max(8, Math.round(size * 0.08));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const fontSize = size < 120 ? 22 : 34;
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div style={{ position: 'relative', marginTop: -size + 6, height: size - 12, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontSize, fontWeight: 900, color, lineHeight: 1 }}>{percent}%</div>
        {label ? <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textMuted, marginTop: 2 }}>{label}</div> : null}
      </div>
    </div>
  );
}

function StatChip({ label, value, theme }) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.06)',
      border: `1px solid ${theme.cardBorder}`,
      minWidth: 0,
      flex: '1 1 120px',
    }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: theme.textHeading, marginTop: 4, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

export function MarathonGoalModal({ open, onClose, userId, runRows, theme, onSaved, initialTab = 'goal' }) {
  const [presetId, setPresetId] = useState('half');
  const [customKm, setCustomKm] = useState('21.1');
  const [raceDate, setRaceDate] = useState('');
  const [modalTab, setModalTab] = useState(initialTab);

  useEffect(() => {
    if (!open) return;
    setModalTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !userId) return;
    const saved = loadMarathonGoal(userId);
    if (saved) {
      setPresetId(saved.presetId || 'half');
      setCustomKm(String(saved.distanceKm || 21.1));
      setRaceDate(saved.raceDate || '');
      return;
    }
    const future = new Date();
    future.setDate(future.getDate() + 56);
    setRaceDate(future.toISOString().slice(0, 10));
  }, [open, userId]);

  const distanceKm = useMemo(() => {
    if (presetId === 'custom') return Math.max(1, Number(customKm) || 21.1);
    const preset = MARATHON_GOAL_PRESETS.find((p) => p.id === presetId);
    return preset?.distanceKm || 21.0975;
  }, [presetId, customKm]);

  const readiness = useMemo(() => buildMarathonReadiness({
    runs: runRows,
    goalDistanceKm: distanceKm,
    raceDate: raceDate || null,
    todayIso: todayIso(),
  }), [runRows, distanceKm, raceDate]);

  function handleSave() {
    if (!userId || !raceDate) return;
    saveMarathonGoal(userId, { presetId, distanceKm, raceDate });
    onSaved?.();
    setModalTab('plan');
  }

  if (!open) return null;

  const tabs = [
    { id: 'goal', label: 'Goal' },
    { id: 'plan', label: 'Plan' },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <div className="marathon-modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(4,8,20,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }} onClick={onClose} role="presentation">
      <div
        className="marathon-modal-panel"
        style={{ width: 'min(560px, 100%)', maxHeight: 'min(90vh, 780px)', overflowY: 'auto', borderRadius: 22, background: theme.panelBg || theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textHeading, padding: '16px 16px 20px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>🏁 Running goal</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: theme.textHeading, fontWeight: 800, cursor: 'pointer' }}>✕</button>
        </div>

        <div className="marathon-modal-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 14, padding: 4, borderRadius: 12, background: 'rgba(0,0,0,0.15)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setModalTab(tab.id)}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '9px 8px',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                background: modalTab === tab.id ? theme.orange : 'transparent',
                color: modalTab === tab.id ? '#fff' : theme.textSecondary,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {modalTab === 'goal' && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>Pick your target distance and race date. Stats and plans adapt to your goal.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {MARATHON_GOAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPresetId(preset.id)}
                  style={{
                    border: `1px solid ${presetId === preset.id ? theme.orange : theme.cardBorder}`,
                    borderRadius: 999,
                    padding: '8px 12px',
                    background: presetId === preset.id ? `${theme.orange}22` : theme.cardBg,
                    color: presetId === preset.id ? theme.orange : theme.textSecondary,
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {preset.emoji} {preset.label}
                </button>
              ))}
            </div>
            <div className="marathon-goal-inputs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {presetId === 'custom' ? (
                <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
                  km
                  <input type="number" min="1" step="0.1" value={customKm} onChange={(e) => setCustomKm(e.target.value)} style={{ borderRadius: 12, border: `1px solid ${theme.cardBorder}`, padding: '10px', background: theme.cardBg, color: theme.textHeading }} />
                </label>
              ) : (
                <div style={{ padding: 10, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, fontWeight: 800, fontSize: 13 }}>{distanceKm.toFixed(1)} km</div>
              )}
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
                Race date
                <input type="date" min={todayIso()} value={raceDate} onChange={(e) => setRaceDate(e.target.value)} style={{ borderRadius: 12, border: `1px solid ${theme.cardBorder}`, padding: '10px', background: theme.cardBg, color: theme.textHeading }} />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: `${readiness.readinessColor}14`, marginBottom: 12 }}>
              <ReadinessRing percent={readiness.readinessPercent} color={readiness.readinessColor} label={readiness.readinessLabel} theme={theme} size={100} />
              <div style={{ fontSize: 13, lineHeight: 1.5, color: theme.textSecondary }}>
                Preview for <strong style={{ color: theme.textHeading }}>{distanceKm.toFixed(1)} km</strong>: finish ~<strong style={{ color: theme.orange }}>{readiness.predictedFinishDisplay}</strong>
              </div>
            </div>
            <button type="button" onClick={handleSave} style={{ width: '100%', border: 'none', borderRadius: 14, padding: 14, background: theme.orange, color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Save goal</button>
          </>
        )}

        {modalTab === 'plan' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {readiness.planPhases.map((phase) => (
              <div key={phase.title} style={{ padding: '11px 12px', borderRadius: 12, border: `1px solid ${phase.accent}44`, background: `${phase.accent}10` }}>
                <div style={{ fontWeight: 800, color: phase.accent, fontSize: 13 }}>{phase.title}</div>
                <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, lineHeight: 1.45 }}>{phase.detail}</div>
              </div>
            ))}
            {!readiness.planPhases.length && <p style={{ fontSize: 13, color: theme.textMuted }}>Save a goal first.</p>}
          </div>
        )}

        {modalTab === 'stats' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <StatChip label="Finish" value={readiness.predictedFinishDisplay} theme={theme} />
              <StatChip label="Pace" value={readiness.predictedPaceDisplay} theme={theme} />
              <StatChip label="Hold today" value={`${readiness.sustainableDistanceKm} km`} theme={theme} />
              <StatChip label="Week km" value={`${readiness.weeklyKmCurrent}/${readiness.weeklyKmTarget}`} theme={theme} />
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 6 }}>
              {readiness.insights.map((line) => (
                <li key={line} style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.45 }}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function MarathonRaceHub({ userId, runRows, theme, onOpenPlan, refreshKey = 0, compact = false }) {
  const [savedGoal, setSavedGoal] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setSavedGoal(loadMarathonGoal(userId));
  }, [userId, refreshKey]);

  const readiness = useMemo(() => buildMarathonReadiness({
    runs: runRows,
    goalDistanceKm: savedGoal?.distanceKm || 21.0975,
    raceDate: savedGoal?.raceDate || null,
    todayIso: todayIso(),
  }), [runRows, savedGoal]);

  const preset = MARATHON_GOAL_PRESETS.find((p) => p.id === savedGoal?.presetId) || MARATHON_GOAL_PRESETS[1];

  if (!savedGoal) {
    return (
      <button type="button" onClick={onOpenPlan} style={{
        width: '100%',
        border: `1px solid ${theme.orange}55`,
        borderRadius: 18,
        padding: '14px 16px',
        background: `linear-gradient(135deg, ${theme.orange}20, ${theme.cyan}10)`,
        color: theme.textHeading,
        cursor: 'pointer',
        textAlign: 'left',
      }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>🏁 Configure your race goal</div>
        <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>10K · 21.1 km half · 42.2 km full — tap to set up</div>
      </button>
    );
  }

  if (compact) {
    return (
      <div style={{ borderRadius: 18, padding: '14px', background: `linear-gradient(135deg, ${readiness.readinessColor}16, transparent)`, border: `1px solid ${readiness.readinessColor}44` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ReadinessRing percent={readiness.readinessPercent} color={readiness.readinessColor} label={readiness.readinessLabel} theme={theme} size={96} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted }}>{preset.emoji} {distanceLabel(savedGoal.distanceKm)}</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{readiness.predictedFinishDisplay}</div>
            <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
              {readiness.daysUntilRace != null ? `${readiness.daysUntilRace}d to race` : '—'} · hold ~{readiness.sustainableDistanceKm} km
            </div>
            <button type="button" onClick={onOpenPlan} style={{ marginTop: 10, border: 'none', background: theme.orange, color: '#fff', borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Edit goal</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <StatChip label="Week" value={`${readiness.weeklyKmCurrent}/${readiness.weeklyKmTarget} km`} theme={theme} />
          <StatChip label="Long run" value={`${readiness.longRunBestKm} km`} theme={theme} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="marathon-hero-compact" style={{ borderRadius: 20, padding: 14, background: `linear-gradient(135deg, ${theme.orange}14, ${theme.cyan}10)`, border: `1px solid ${theme.cardBorder}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{preset.emoji} {distanceLabel(savedGoal.distanceKm)}</div>
          <button type="button" onClick={onOpenPlan} style={{ border: 'none', background: theme.orange, color: '#fff', borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Edit</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ReadinessRing percent={readiness.readinessPercent} color={readiness.readinessColor} label={readiness.readinessLabel} theme={theme} size={108} />
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <StatChip label="Finish" value={readiness.predictedFinishDisplay} theme={theme} />
            <StatChip label="Today" value={`${readiness.sustainableDistanceKm} km`} theme={theme} />
          </div>
        </div>
        <button type="button" onClick={() => setShowDetails((v) => !v)} style={{ marginTop: 12, width: '100%', border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: '9px', background: 'transparent', color: theme.textSecondary, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {showDetails ? 'Hide details' : 'Show plan & insights'}
        </button>
        {showDetails && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {readiness.insights.slice(0, 3).map((line) => (
              <div key={line} style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.45 }}>• {line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function distanceLabel(km) {
  const value = Number(km) || 21.0975;
  if (Math.abs(value - 42.195) < 0.5) return 'Full marathon';
  if (Math.abs(value - 21.0975) < 0.2) return 'Half marathon';
  if (Math.abs(value - 10) < 0.2) return '10K';
  return `${value.toFixed(1)} km`;
}
