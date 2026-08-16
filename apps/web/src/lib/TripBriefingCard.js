import { useEffect, useState } from 'react';
import { daysUntil, tripDateLabel, tripPlaceQuery } from './tripEvent';

export function TripBriefingCard({ group, theme }) {
  const [briefing, setBriefing] = useState(null);
  const extrasOn = String(group?.threadKind || 'trip') !== 'memory';
  const place = tripPlaceQuery(group);
  const countdown = daysUntil(group?.eventStartAt);
  const showCountdown = countdown != null && countdown >= 0;
  const dateLabel = tripDateLabel(group);
  const loadExtras = extrasOn && Boolean(place);

  useEffect(() => {
    if (!loadExtras) {
      setBriefing(null);
      return undefined;
    }
    let cancelled = false;
    fetch(`/api/trip-briefing?place=${encodeURIComponent(place)}&start=${encodeURIComponent(group.eventStartAt || '')}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setBriefing(payload);
      })
      .catch(() => {
        if (!cancelled) setBriefing(null);
      });
    return () => { cancelled = true; };
  }, [loadExtras, place, group?.eventStartAt]);

  if (!group) return null;
  const showCard = showCountdown || extrasOn || Boolean(group.budgetEstimate) || Boolean(dateLabel);
  if (!showCard) return null;

  return (
    <div className="trip-briefing" style={{
      margin: '0 12px 10px',
      padding: '12px 12px 10px',
      borderRadius: 16,
      border: `1px solid ${theme.cardBorder}`,
      background: 'linear-gradient(180deg, #141414, #0a0a0a)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted }}>
            {showCountdown ? 'Upcoming trip' : 'Trip details'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: theme.textHeading, marginTop: 4 }}>
            {place || group.name}
          </div>
          {dateLabel ? <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{dateLabel}</div> : null}
        </div>
        {showCountdown ? (
          <div style={{
            minWidth: 64,
            textAlign: 'center',
            borderRadius: 12,
            padding: '8px 10px',
            background: '#111',
            border: `1px solid ${theme.cardBorder}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fafafa', lineHeight: 1 }}>{countdown === 0 ? '0' : countdown}</div>
            <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>{countdown === 0 ? 'today' : countdown === 1 ? 'day to go' : 'days to go'}</div>
          </div>
        ) : null}
      </div>
      {group.budgetEstimate ? (
        <div style={{ marginTop: 8, fontSize: 12, color: theme.textSecondary }}>Budget estimate: <strong style={{ color: theme.textHeading }}>{group.budgetEstimate}</strong></div>
      ) : null}
      {extrasOn && briefing?.weather ? (
        <div style={{ marginTop: 8, fontSize: 12, color: theme.textSecondary, lineHeight: 1.45 }}>
          Weather now {briefing.weather.temperature != null ? `${Math.round(briefing.weather.temperature)}${briefing.weather.unit}` : ''}
          {briefing.weather.high != null ? ` · high ${Math.round(briefing.weather.high)}` : ''}
          {briefing.weather.low != null ? ` / low ${Math.round(briefing.weather.low)}` : ''}
          {briefing.weather.rainChance != null ? ` · rain ${briefing.weather.rainChance}%` : ''}
        </div>
      ) : null}
      {extrasOn && briefing?.news?.[0] ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
          {briefing.news[0].summary}
          {briefing.news[0].url ? (
            <>
              {' '}
              <a href={briefing.news[0].url} target="_blank" rel="noreferrer" style={{ color: theme.blue }}>More</a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
