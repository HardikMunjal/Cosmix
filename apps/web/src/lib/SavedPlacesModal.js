import { useEffect, useState } from 'react';
import { PlaceSearchResults, useGeocodeSearch } from './buddySafetyPlaceSearch';

function destinationKey(place) {
  if (!place) return '';
  return `${Number(place.lat).toFixed(5)}:${Number(place.lng).toFixed(5)}`;
}

function displayName(dest) {
  return dest?.name || dest?.label?.split(',')[0] || 'Saved destination';
}

export function SavedPlacesModal({
  open,
  onClose,
  profile = {},
  onSave,
  saving = false,
}) {
  const [draftDestinations, setDraftDestinations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const search = useGeocodeSearch(searchQuery, { proximity: { city: 'Bengaluru' } });
  const destinations = Array.isArray(profile.destinations) ? profile.destinations : [];

  useEffect(() => {
    if (!open) return;
    setDraftDestinations(destinations);
    setSearchQuery('');
  }, [open, destinations]);

  const addDestination = (place) => {
    const key = destinationKey(place);
    if (!key) return;
    setDraftDestinations((prev) => {
      if (prev.some((item) => destinationKey(item) === key)) return prev;
      return [
        ...prev,
        {
          id: `dest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          lat: place.lat,
          lng: place.lng,
          label: place.label,
          name: place.shortLabel || place.label?.split(',')[0] || 'Saved destination',
        },
      ];
    });
    setSearchQuery('');
  };

  const removeDestination = (id) => {
    setDraftDestinations((prev) => prev.filter((item) => item.id !== id));
  };

  const updateDestinationName = (id, name) => {
    setDraftDestinations((prev) => prev.map((item) => (
      item.id === id ? { ...item, name } : item
    )));
  };

  if (!open) return null;

  return (
    <div className="bs-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="bs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-saved-places-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bs-modal-header">
          <div>
            <div className="bs-eyebrow">Quick picks</div>
            <h2 id="bs-saved-places-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>Saved destinations</h2>
          </div>
          <button type="button" className="bs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="bs-modal-body">
          <p className="bs-modal-lead">
            Add places you go to often. Pick one when starting a trip instead of searching again.
          </p>

          {draftDestinations.length ? (
            <div className="bs-modal-section">
              <div className="bs-modal-section-title">Your saved destinations</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {draftDestinations.map((dest) => (
                  <div key={dest.id} style={{ display: 'grid', gap: 6 }}>
                    <input
                      value={dest.name || ''}
                      onChange={(e) => updateDestinationName(dest.id, e.target.value)}
                      className="bs-input"
                      placeholder="Destination name"
                    />
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{dest.label}</div>
                    <button type="button" className="bs-btn-ghost" onClick={() => removeDestination(dest.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="bs-modal-section-hint">No saved destinations yet.</p>
          )}

          <div className="bs-modal-section">
            <div className="bs-modal-section-title">Add destination</div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bs-input"
              placeholder="Search place, e.g. Prestige Tech Park"
              autoComplete="off"
              spellCheck={false}
            />
            <PlaceSearchResults
              results={search.results}
              loading={search.loading}
              error={search.error}
              query={searchQuery}
              onSelect={addDestination}
            />
          </div>

          <div className="bs-modal-footer-row">
            <button type="button" className="bs-btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="bs-btn-primary"
              disabled={saving}
              onClick={() => onSave({ destinations: draftDestinations })}
            >
              {saving ? 'Saving…' : 'Save destinations'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatSavedDestinationsSummary(destinations = []) {
  if (!destinations.length) return 'No saved destinations yet.';
  const names = destinations.map(displayName);
  if (names.length <= 3) return names.join(' · ');
  return `${names.slice(0, 3).join(' · ')} +${names.length - 3} more`;
}
