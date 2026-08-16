export function formatTripDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysUntil(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const target = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function isPastTripDate(value) {
  const days = daysUntil(value);
  return days != null && days < 0;
}

export function isUpcomingTrip(group) {
  if (!group) return false;
  if (String(group.threadKind || 'trip') === 'memory') return false;
  const start = daysUntil(group.eventStartAt);
  const end = daysUntil(group.eventEndAt);
  if (end != null && end >= 0) return true;
  if (start != null && start >= 0) return true;
  return false;
}

export function tripPlaceQuery(group) {
  const destination = String(group?.destination || '').trim();
  if (destination) return destination;
  return String(group?.name || '')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/ig, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(trip|family|friends|wedding|marriage|haldi|with)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim() || String(group?.name || '').trim();
}

export function tripDateLabel(group) {
  const start = formatTripDate(group?.eventStartAt);
  const end = formatTripDate(group?.eventEndAt);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || '';
}
