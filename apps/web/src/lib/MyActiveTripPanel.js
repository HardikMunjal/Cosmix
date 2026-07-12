import dynamic from 'next/dynamic';
import { formatKm } from './buddySafetyGeo';
import { LiveBadge } from './buddySafetyUI';

const BuddySafetyMap = dynamic(
  () => import('./BuddySafetyMap').then((mod) => mod.BuddySafetyMap),
  {
    ssr: false,
    loading: () => (
      <div className="bs-my-trip-map bs-my-trip-map--loading">Loading map…</div>
    ),
  },
);

export function MyActiveTripPanel({
  trip,
  isTracking = false,
  watchUrl = '',
  onEndTrip,
  onResumeGps,
  onCopyLink,
  onShareWhatsApp,
  onStartNew,
  ending = false,
}) {
  if (!trip) return null;

  const lastPing = trip.pings?.length ? trip.pings[trip.pings.length - 1] : null;
  const fromLabel = trip.origin?.shortLabel || trip.origin?.label?.split(',').slice(0, 2).join(', ') || 'Current location';
  const toLabel = trip.destination?.shortLabel || trip.destination?.label?.split(',')[0] || 'Destination';

  return (
    <div className="bs-my-trip">
      <div className="bs-my-trip-top">
        <div>
          <LiveBadge label="Live" />
          <h3 className="bs-my-trip-heading">{toLabel}</h3>
          <p className="bs-my-trip-sub">
            {fromLabel} → {toLabel}
            {lastPing ? ` · ${formatKm(lastPing.distanceToDest)} left` : ''}
          </p>
        </div>
        <button type="button" className="bs-my-trip-end" onClick={onEndTrip} disabled={ending}>
          {ending ? 'Ending…' : 'End'}
        </button>
      </div>

      <BuddySafetyMap
        trip={trip}
        className="bs-my-trip-map"
      />

      <div className="bs-my-trip-toolbar">
        {!isTracking ? (
          <button type="button" className="bs-my-trip-action" onClick={onResumeGps}>Resume GPS</button>
        ) : null}
        {watchUrl ? (
          <>
            <button type="button" className="bs-my-trip-action" onClick={onCopyLink}>Copy link</button>
            <button type="button" className="bs-my-trip-action bs-my-trip-action--accent" onClick={onShareWhatsApp}>WhatsApp</button>
          </>
        ) : null}
      </div>

      {watchUrl ? (
        <div className="bs-my-trip-link">{watchUrl}</div>
      ) : null}

      {trip.shareEndsAt ? (
        <p className="bs-my-trip-meta">
          Auto-ends {new Date(trip.shareEndsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      ) : null}

      <button type="button" className="bs-my-trip-new" onClick={onStartNew}>
        Start another trip
      </button>
    </div>
  );
}
