import dynamic from 'next/dynamic';
import { formatDuration, formatKm } from './buddySafetyGeo';
import {
  BuddySafetyStyles,
  LiveBadge,
  MapFrame3D,
  MetricTile3D,
  ProgressRing3D,
  TiltCard,
} from './buddySafetyUI';

const BuddySafetyMap = dynamic(
  () => import('./BuddySafetyMap').then((mod) => mod.BuddySafetyMap),
  {
    ssr: false,
    loading: () => (
      <div className="bs-map-canvas" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        background: 'rgba(2,6,23,0.6)',
      }}
      >
        <span className="bs-live-badge"><span className="bs-live-dot" /> Loading map…</span>
      </div>
    ),
  },
);

export function BuddySafetyTripView({
  trip,
  theme,
  showShareActions = false,
  onShareWhatsApp,
  onShareSms,
  watchUrl = '',
}) {
  if (!trip) return null;
  const lastPing = trip.pings?.length ? trip.pings[trip.pings.length - 1] : null;
  const progressPct = lastPing?.progressPct ?? 0;
  const unackedStall = (trip.alerts || []).filter((a) => a.type === 'stall' && !a.acknowledged);
  const isLive = trip.status === 'active';

  return (
    <>
      <BuddySafetyStyles />

      {unackedStall.length ? (
        <div className="bs-alert-banner" style={{ marginBottom: 16 }}>
          <strong>⚠ Safety alert:</strong> {unackedStall[unackedStall.length - 1].message}
        </div>
      ) : null}

      <TiltCard>
        <div className="bs-cockpit-header" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', justifyContent: 'inherit' }}>
              <div className="bs-eyebrow" style={{ margin: 0 }}>Live cockpit</div>
              {isLive ? <LiveBadge label="Tracking live" /> : null}
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.25rem, 4vw, 1.65rem)', fontWeight: 900, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>{trip.title}</h2>
            <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {trip.travellerName}
              {trip.travellerUsername ? ` (@${trip.travellerUsername})` : ''}
            </p>
          </div>
          <ProgressRing3D pct={progressPct} size={96} accent={theme?.green || '#22c55e'} accent2={theme?.cyan || '#38bdf8'} />
        </div>

        <div className="bs-metric-grid" style={{ position: 'relative', zIndex: 1 }}>
          <MetricTile3D label="Distance left" value={lastPing ? formatKm(lastPing.distanceToDest) : '—'} color={theme?.yellow || '#eab308'} icon="📍" />
          <MetricTile3D label="Covered" value={lastPing ? formatKm(lastPing.distanceFromStart) : '—'} icon="🛣️" />
          <MetricTile3D label="Planned" value={formatKm(trip.plannedDistanceKm)} icon="🎯" />
          <MetricTile3D label="Trip time" value={formatDuration(Date.now() - Number(trip.createdAt || Date.now()))} icon="⏱️" />
        </div>

        {showShareActions && watchUrl ? (
          <div className="bs-btn-row" style={{ marginTop: 18, position: 'relative', zIndex: 1 }}>
            <button type="button" className="bs-btn-ghost" onClick={() => navigator.clipboard?.writeText(watchUrl)}>Copy watch link</button>
            {onShareWhatsApp ? (
              <button type="button" className="bs-btn-primary" style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }} onClick={onShareWhatsApp}>WhatsApp</button>
            ) : null}
            {onShareSms ? (
              <button type="button" className="bs-btn-ghost" onClick={onShareSms}>SMS</button>
            ) : null}
          </div>
        ) : null}
      </TiltCard>

      <TiltCard style={{ animationDelay: '0.08s' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="bs-eyebrow">Route visualization</div>
          <h2 style={{ margin: '0 0 6px', fontSize: 'clamp(1.1rem, 3.5vw, 1.4rem)', fontWeight: 800 }}>Live track</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 0, lineHeight: 1.45 }}>
            Planned route · Travelled path · Live position
          </p>
          <MapFrame3D>
            <BuddySafetyMap trip={trip} theme={theme} className="bs-map-canvas" />
          </MapFrame3D>
        </div>
      </TiltCard>

      {(trip.alerts || []).length ? (
        <TiltCard style={{ animationDelay: '0.16s' }}>
          <div className="bs-eyebrow">Trip timeline</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(1.1rem, 3.5vw, 1.4rem)', fontWeight: 800 }}>Milestones & alerts</h2>
          <div style={{ display: 'grid', gap: 10, position: 'relative', zIndex: 1 }}>
            {[...(trip.alerts || [])].reverse().map((alert, index) => (
              <div
                key={alert.id}
                className={`bs-timeline-item${alert.type === 'stall' ? ' is-stall' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div style={{ fontWeight: 800, color: alert.type === 'stall' ? '#f87171' : '#f1f5f9' }}>
                  {alert.type === 'stall' ? '⚠ Stall alert' : alert.type === 'milestone' ? `✓ ${alert.km} km milestone` : '✓ Arrived'}
                </div>
                <div style={{ color: '#94a3b8', marginTop: 6, lineHeight: 1.45 }}>{alert.message}</div>
              </div>
            ))}
          </div>
        </TiltCard>
      ) : null}
    </>
  );
}
