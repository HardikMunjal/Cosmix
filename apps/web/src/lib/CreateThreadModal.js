import { useEffect, useState } from 'react';
import { isPastTripDate } from './tripEvent';

export function CreateThreadModal({
  theme,
  styles,
  friends = [],
  groupForm,
  setGroupForm,
  threadCoverPreview,
  threadCoverFile,
  onPickCover,
  onClose,
  onSubmit,
  creatingThread = false,
}) {
  const [placeQuery, setPlaceQuery] = useState(groupForm.destination || '');
  const [placePicked, setPlacePicked] = useState(Boolean(groupForm.destination));
  const { results, loading, error } = useTripPlaceSearch(placePicked ? '' : placeQuery);
  const past = isPastTripDate(groupForm.eventStartAt);

  function selectPlace(place) {
    const label = place.shortLabel || place.label || place.name || '';
    setPlaceQuery(label);
    setPlacePicked(true);
    setGroupForm((previous) => ({ ...previous, destination: label }));
  }

  function toggleFriend(friend) {
    setGroupForm((previous) => {
      const friendRoles = { ...(previous.friendRoles || {}) };
      if (friendRoles[friend]) delete friendRoles[friend];
      else friendRoles[friend] = 'member';
      return { ...previous, friendRoles };
    });
  }

  function setTravelDate(value) {
    const nextPast = isPastTripDate(value);
    setGroupForm((previous) => ({
      ...previous,
      eventStartAt: value,
      eventEndAt: '',
      showWeather: !nextPast,
      showNews: !nextPast,
    }));
  }

  const selectedCount = Object.keys(groupForm.friendRoles || {}).length;

  return (
    <div style={styles.modalBackdrop} onClick={onClose} role="presentation">
      <form
        className="create-thread-popup"
        style={{ ...styles.modalPanel, width: 'min(420px, 100%)', padding: '16px 14px 14px', display: 'grid', gap: 10 }}
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-thread-title"
      >
        <div style={styles.modalHead}>
          <div>
            <h2 id="create-thread-title" style={{ ...styles.modalTitle, fontSize: 20 }}>New thread</h2>
            <p style={{ ...styles.helperText, margin: '4px 0 0' }}>Name it, pick a date, invite people.</p>
          </div>
          <button type="button" style={styles.modalCloseBtn} aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <button
          type="button"
          onClick={onPickCover}
          style={{
            border: `1px dashed ${theme.cardBorder}`,
            background: theme.cardBg,
            borderRadius: 16,
            overflow: 'hidden',
            minHeight: threadCoverPreview ? 0 : 72,
            color: theme.textSecondary,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: threadCoverPreview ? 0 : 12,
          }}
        >
          {threadCoverPreview ? (
            threadCoverFile && threadCoverFile.type.startsWith('video/') ? (
              <video src={threadCoverPreview} style={{ width: '100%', maxHeight: 140, objectFit: 'cover', display: 'block' }} muted playsInline />
            ) : (
              <img src={threadCoverPreview} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', display: 'block' }} />
            )
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700 }}>📷 Cover photo</span>
          )}
        </button>

        <input
          style={styles.input}
          value={groupForm.name}
          onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Thread name"
          autoFocus
        />

        <div style={{ position: 'relative' }}>
          <div
            style={{
              ...styles.input,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              pointerEvents: 'none',
            }}
          >
            <span style={{ color: groupForm.eventStartAt ? theme.textPrimary : theme.textMuted, fontWeight: 700 }}>
              {groupForm.eventStartAt
                ? new Date(`${groupForm.eventStartAt}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                : 'Travel date'}
            </span>
            <span aria-hidden="true">📅</span>
          </div>
          <input
            type="date"
            value={groupForm.eventStartAt}
            onChange={(e) => setTravelDate(e.target.value)}
            onFocus={(e) => { try { e.target.showPicker?.(); } catch (_) { /* native calendar */ } }}
            aria-label="Travel date"
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
            }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <input
            style={styles.input}
            value={placeQuery}
            onChange={(e) => {
              setPlaceQuery(e.target.value);
              setPlacePicked(false);
              setGroupForm((p) => ({ ...p, destination: e.target.value }));
            }}
            placeholder="Place (search maps)"
            autoComplete="off"
          />
          {placeQuery.trim().length >= 2 && !placePicked && (loading || results.length || error) ? (
            <div style={{
              marginTop: 6,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 12,
              background: theme.cardBg,
              maxHeight: 168,
              overflowY: 'auto',
            }}>
              {loading ? <div style={{ ...styles.helperText, padding: '8px 10px' }}>Searching maps…</div> : null}
              {!loading && error && !results.length ? <div style={{ ...styles.helperText, padding: '8px 10px' }}>{error}</div> : null}
              {results.map((place) => (
                <button
                  key={`${place.lat}-${place.lng}-${place.label}`}
                  type="button"
                  onClick={() => selectPlace(place)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: theme.textPrimary,
                    padding: '9px 10px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{place.shortLabel || place.name}</div>
                  {place.label && place.label !== place.shortLabel ? (
                    <div style={{ fontSize: 11, color: theme.textMuted }}>{place.label}</div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <label style={chipStyle(theme, groupForm.showWeather !== false && !past)}>
            <input
              type="checkbox"
              checked={groupForm.showWeather !== false && !past}
              onChange={(e) => setGroupForm((p) => ({ ...p, showWeather: e.target.checked }))}
              disabled={past}
            />
            Weather
          </label>
          <label style={chipStyle(theme, groupForm.showNews !== false && !past)}>
            <input
              type="checkbox"
              checked={groupForm.showNews !== false && !past}
              onChange={(e) => setGroupForm((p) => ({ ...p, showNews: e.target.checked }))}
              disabled={past}
            />
            News
          </label>
        </div>
        {past ? (
          <p style={{ ...styles.helperText, margin: 0 }}>Past date — weather and news stay off. Countdown appears only for future dates.</p>
        ) : (
          <p style={{ ...styles.helperText, margin: 0 }}>Countdown is added automatically when the date is upcoming.</p>
        )}

        <div>
          <p style={{ ...styles.helperText, margin: '0 0 6px', fontWeight: 700, color: theme.textSecondary }}>
            Buddies {selectedCount ? `· ${selectedCount}` : ''}
          </p>
          {friends.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {friends.map((friend) => {
                const selected = Boolean(groupForm.friendRoles?.[friend]);
                return (
                  <button
                    key={friend}
                    type="button"
                    onClick={() => toggleFriend(friend)}
                    style={{
                      border: `1px solid ${selected ? theme.blue : theme.cardBorder}`,
                      background: selected ? `${theme.blue}22` : theme.cardBg,
                      color: theme.textHeading,
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    @{friend}
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ ...styles.helperText, margin: 0 }}>Add friends first, then invite them here.</p>
          )}
        </div>

        <button type="submit" style={{ ...styles.btn, marginTop: 4 }} disabled={creatingThread}>
          {creatingThread ? 'Creating…' : 'Create'}
        </button>
      </form>
    </div>
  );
}

function chipStyle(theme, on) {
  return {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 10px',
    borderRadius: 12,
    border: `1px solid ${on ? theme.blue : theme.cardBorder}`,
    background: on ? `${theme.blue}18` : theme.cardBg,
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function useTripPlaceSearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = String(query || '').trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/trip-places?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Place search failed.');
        const next = Array.isArray(data.results) ? data.results : [];
        setResults(next);
        if (!next.length) setError('No matching places.');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setResults([]);
        setError(err.message || 'Could not search places.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, loading, error };
}
