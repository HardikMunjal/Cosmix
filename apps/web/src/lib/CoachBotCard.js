import { RunningCartoon } from './RunningCartoon';

export function CoachBotCard({ tip, theme }) {
  if (!tip) return null;
  const accent = theme.cyan || theme.blue || '#38bdf8';
  return (
    <div
      style={{
        borderRadius: 22,
        border: `1px solid ${accent}55`,
        background:
          `radial-gradient(120% 80% at 0% 0%, ${accent}22, transparent 45%),`
          + `linear-gradient(155deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))`,
        boxShadow: `0 18px 40px rgba(2,6,23,0.35), inset 0 1px 0 rgba(255,255,255,0.08)`,
        overflow: 'hidden',
        color: '#e2e8f0',
      }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        gap: 12,
        padding: '14px 14px 10px',
        alignItems: 'center',
      }}
      >
        <div style={{ position: 'relative' }}>
          <RunningCartoon size={84} label="" variant="bot" />
          <div style={{
            position: 'absolute',
            right: 4,
            bottom: 8,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#22c55e',
            boxShadow: '0 0 0 3px rgba(34,197,94,0.25)',
          }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: accent,
          }}
          >
            Cosmix Coach · online
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc', marginTop: 4 }}>
            {tip.title}
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6, lineHeight: 1.5 }}>
            {tip.tip}
          </div>
          {tip.action ? (
            <div style={{
              display: 'inline-flex',
              marginTop: 10,
              padding: '6px 10px',
              borderRadius: 999,
              background: `${accent}22`,
              border: `1px solid ${accent}55`,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: accent,
            }}
            >
              Next · {tip.action}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gap: 8,
        padding: '0 14px 14px',
      }}
      >
        {[
          { label: 'When', value: tip.nextWhen, icon: '⏱' },
          { label: 'Fuel', value: tip.fuel, icon: '🍽' },
          { label: 'Hydration', value: tip.hydration, icon: '💧' },
          { label: 'Sleep', value: tip.sleep, icon: '☾' },
        ].filter((row) => row.value).map((row) => (
          <div
            key={row.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 1fr',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(2,6,23,0.45)',
              border: '1px solid rgba(148,163,184,0.18)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
              {row.icon} {row.label}
            </div>
            <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.45, fontWeight: 600 }}>
              {row.value}
            </div>
          </div>
        ))}
        {tip.meta ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {[
              tip.meta.weekKm != null ? `7d ${tip.meta.weekKm} km` : null,
              tip.meta.runs7 != null ? `${tip.meta.runs7} runs/7d` : null,
              tip.meta.avgHr7 != null ? `HR ${tip.meta.avgHr7}` : null,
              tip.meta.avgSpeed3 != null ? `${tip.meta.avgSpeed3} km/h` : null,
              tip.meta.recentPeak != null ? `peak ${tip.meta.recentPeak} km` : null,
            ].filter(Boolean).map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'rgba(148,163,184,0.12)',
                  color: '#94a3b8',
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
