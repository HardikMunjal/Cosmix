/** Build shareable deep links for SMS / WhatsApp alerts. */

export function normalizePhoneE164(raw, defaultCountry = '91') {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (String(raw || '').trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10 && defaultCountry === '91') return `+91${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return `+${defaultCountry}${digits}`;
}

export function buildPublicWatchUrl(origin, shareToken) {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/buddy-safety/watch/${encodeURIComponent(shareToken)}`;
}

export function buildWhatsAppUrl(phone, message) {
  const text = encodeURIComponent(String(message || '').trim());
  const normalized = normalizePhoneE164(phone);
  if (normalized) {
    return `https://wa.me/${normalized.replace('+', '')}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}

export function buildSmsUrl(phone, message) {
  const normalized = normalizePhoneE164(phone);
  const body = encodeURIComponent(String(message || '').trim());
  if (normalized) {
    return `sms:${normalized}?body=${body}`;
  }
  return `sms:?body=${body}`;
}

export function formatAlertMessage(trip, event, watchUrl) {
  const traveller = trip.travellerName || trip.travellerUsername || 'Your buddy';
  const title = trip.title || 'Trip';
  const lines = [`🛡 Cosmix Buddy Safety`, `${traveller} · ${title}`];
  if (event?.message) lines.push(event.message);
  if (watchUrl) lines.push(`Live map: ${watchUrl}`);
  return lines.join('\n');
}
