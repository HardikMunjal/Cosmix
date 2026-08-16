import { useEffect, useMemo, useState } from 'react';
import {
  BUDGET_CATEGORIES,
  budgetTotal,
  describeWeather,
  formatMoney,
  parseBudgetEstimate,
  stringifyBudgetEstimate,
} from './tripBudget';
import { daysUntil, formatTripDate, tripPlaceQuery } from './tripEvent';

export function ThreadOpenPicker({ group, theme, styles, onPick, onClose }) {
  if (!group) return null;
  return (
    <div style={styles.modalBackdrop} onClick={onClose} role="presentation">
      <div
        style={{ ...styles.modalPanel, width: 'min(400px, 100%)', padding: 16, display: 'grid', gap: 10 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="thread-open-title"
      >
        <div style={styles.modalHead}>
          <div>
            <h2 id="thread-open-title" style={{ ...styles.modalTitle, fontSize: 18 }}>{group.name}</h2>
            <p style={{ ...styles.helperText, margin: '4px 0 0' }}>What do you want to open?</p>
          </div>
          <button type="button" style={styles.modalCloseBtn} aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {[
          { id: 'albums', icon: '📸', label: 'Albums', hint: 'Photos, videos, folders' },
          { id: 'chat', icon: '💬', label: 'Chat', hint: 'Group messages' },
          { id: 'details', icon: '🧭', label: 'Details', hint: 'Weather, news, budget' },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px minmax(0, 1fr)',
              gap: 10,
              alignItems: 'center',
              textAlign: 'left',
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              color: theme.textPrimary,
              borderRadius: 16,
              padding: '12px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 26, display: 'grid', placeItems: 'center' }}>{option.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: theme.textHeading }}>{option.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{option.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThreadDetailsPanel({ group, theme, styles, canEdit = false, onSaveBudget }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [budget, setBudget] = useState(() => parseBudgetEstimate(group?.budgetEstimate));
  const [saving, setSaving] = useState(false);
  const place = tripPlaceQuery(group);
  const countdown = daysUntil(group?.eventStartAt);
  const extrasOn = String(group?.threadKind || 'trip') !== 'memory';
  const total = budgetTotal(budget);
  const current = briefing?.weather;
  const sky = describeWeather(current?.code);

  useEffect(() => {
    setBudget(parseBudgetEstimate(group?.budgetEstimate));
  }, [group?.id, group?.budgetEstimate]);

  useEffect(() => {
    if (!place) {
      setBriefing(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/trip-briefing?place=${encodeURIComponent(place)}&start=${encodeURIComponent(group?.eventStartAt || '')}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setBriefing(payload);
      })
      .catch(() => {
        if (!cancelled) setBriefing(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [place, group?.eventStartAt]);

  const slices = useMemo(
    () => BUDGET_CATEGORIES.map((item) => ({
      ...item,
      value: Number(budget[item.id] || 0) || 0,
      pct: total > 0 ? Math.round(((Number(budget[item.id] || 0) || 0) / total) * 100) : 0,
    })),
    [budget, total],
  );

  async function handleSave(event) {
    event.preventDefault();
    if (!onSaveBudget) return;
    setSaving(true);
    try {
      await onSaveBudget(stringifyBudgetEstimate(budget));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={card(theme)}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted }}>Trip</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: theme.textHeading, marginTop: 4 }}>{place || group?.name}</div>
        <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
          {formatTripDate(group?.eventStartAt) || 'No travel date yet'}
          {countdown != null && countdown >= 0 ? ` · ${countdown === 0 ? 'today' : `${countdown} days to go`}` : ''}
        </div>
      </section>

      {extrasOn ? (
        <section style={card(theme, 'linear-gradient(160deg, #0b1c33 0%, #071018 55%, #111 100%)')}>
          {loading && !current ? <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading weather…</div> : null}
          {current ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#93c5fd' }}>Live weather</div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: '#f8fafc', lineHeight: 1.05, marginTop: 8 }}>
                    {current.temperature != null ? `${Math.round(current.temperature)}°` : '--'}
                  </div>
                  <div style={{ fontSize: 14, color: '#dbeafe', marginTop: 4 }}>{sky.emoji} {sky.label}</div>
                  <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 6 }}>{current.label || place}</div>
                </div>
                <div style={{ display: 'grid', gap: 6, minWidth: 108 }}>
                  <WeatherStat label="High / Low" value={rangeText(current.high, current.low)} />
                  <WeatherStat label="Rain" value={current.rainChance != null ? `${current.rainChance}%` : '--'} />
                  <WeatherStat label="Wind" value={current.wind != null ? `${Math.round(current.wind)} km/h` : '--'} />
                  <WeatherStat label="Humidity" value={current.humidity != null ? `${Math.round(current.humidity)}%` : '--'} />
                </div>
              </div>
              {Array.isArray(briefing?.forecast) && briefing.forecast.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 8, marginTop: 16 }}>
                  {briefing.forecast.slice(0, 7).map((day) => {
                    const look = describeWeather(day.code);
                    return (
                      <div key={day.date} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '10px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>{day.label}</div>
                        <div style={{ fontSize: 20, margin: '6px 0 4px' }}>{look.emoji}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc' }}>{Math.round(day.high)}°</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{Math.round(day.low)}°</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : !loading ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Add a place to see weather for this trip.</div>
          ) : null}
        </section>
      ) : (
        <section style={card(theme)}>
          <div style={{ fontSize: 13, color: theme.textMuted }}>This is a past-event thread, so live weather and news stay hidden.</div>
        </section>
      )}

      {extrasOn && briefing?.news?.[0] ? (
        <section style={card(theme)}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted }}>Place notes</div>
          <h3 style={{ margin: '6px 0 8px', fontSize: 16, color: theme.textHeading }}>{briefing.news[0].title}</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: theme.textSecondary }}>{briefing.news[0].summary}</p>
          {briefing.news[0].url ? (
            <a href={briefing.news[0].url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, color: theme.blue, fontSize: 12, fontWeight: 800 }}>Read more</a>
          ) : null}
        </section>
      ) : null}

      <section style={card(theme)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted }}>Budget estimator</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: theme.textHeading, marginTop: 4 }}>{formatMoney(total, budget.currency)}</div>
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>Hotels, food, travel</div>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {slices.map((item) => (
            <div key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: theme.textHeading, fontWeight: 700 }}>{item.emoji} {item.label}</span>
                <span style={{ color: theme.textMuted }}>{item.pct}% · {formatMoney(item.value, budget.currency)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 99, background: theme.cardBorder, overflow: 'hidden' }}>
                <div style={{ width: `${item.pct}%`, height: '100%', background: barColor(item.id), borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {canEdit ? (
        <form style={card(theme)} onSubmit={handleSave}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted, marginBottom: 10 }}>Update estimates</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {BUDGET_CATEGORIES.map((item) => (
              <label key={item.id} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary }}>{item.emoji} {item.label}</span>
                <input
                  style={styles.input}
                  inputMode="numeric"
                  value={budget[item.id] || ''}
                  onChange={(event) => setBudget((previous) => ({ ...previous, [item.id]: Number(String(event.target.value).replace(/[^\d.]/g, '')) || 0 }))}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
          <button type="submit" style={{ ...styles.btn, marginTop: 12 }} disabled={saving}>
            {saving ? 'Saving…' : 'Save budget'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function WeatherStat({ label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '7px 8px' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#93c5fd' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function rangeText(high, low) {
  if (high == null && low == null) return '--';
  if (high != null && low != null) return `${Math.round(high)}° / ${Math.round(low)}°`;
  return `${Math.round(high ?? low)}°`;
}

function barColor(id) {
  if (id === 'hotels') return '#38bdf8';
  if (id === 'food') return '#fb923c';
  if (id === 'travel') return '#a78bfa';
  if (id === 'activities') return '#34d399';
  return '#eab308';
}

function card(theme, background) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: background || theme.cardBg,
    borderRadius: 18,
    padding: 14,
  };
}
