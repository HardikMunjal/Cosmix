import {
  buildPublicWatchUrl,
  buildSmsUrl,
  buildWhatsAppUrl,
  formatAlertMessage,
  normalizePhoneE164,
} from '../lib/buddySafetyLinks';

function chatServiceBase() {
  const configured = String(process.env.CHAT_SERVICE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return 'http://127.0.0.1:3002';
}

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID
    && process.env.TWILIO_AUTH_TOKEN
    && (process.env.TWILIO_SMS_FROM || process.env.TWILIO_WHATSAPP_FROM),
  );
}

async function twilioSend({ to, body, channel = 'sms' }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === 'whatsapp'
    ? process.env.TWILIO_WHATSAPP_FROM
    : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from || !to) {
    return { ok: false, reason: 'not-configured' };
  }

  const toFormatted = channel === 'whatsapp'
    ? (String(to).startsWith('whatsapp:') ? to : `whatsapp:${normalizePhoneE164(to)}`)
    : normalizePhoneE164(to);
  const fromFormatted = String(from).startsWith('whatsapp:') || channel !== 'whatsapp'
    ? from
    : `whatsapp:${from}`;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({
    To: toFormatted,
    From: fromFormatted,
    Body: body,
  });

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, reason: data.message || 'twilio-error' };
    }
    return { ok: true, sid: data.sid };
  } catch (error) {
    return { ok: false, reason: error.message || 'twilio-failed' };
  }
}

async function sendWebPushToWatcher(trip, event, appOrigin) {
  const watcher = String(trip.watcherUsername || '').trim();
  if (!watcher) return { ok: false, reason: 'no-watcher-username' };

  const watchUrl = buildPublicWatchUrl(appOrigin, trip.shareToken);
  const title = event.type === 'stall'
    ? `⚠ Safety alert — ${trip.travellerName || 'Family'}`
    : `${trip.travellerName || 'Family'} · Trip update`;

  try {
    const response = await fetch(`${chatServiceBase()}/chat/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: [watcher],
        title,
        body: event.message || formatAlertMessage(trip, event, watchUrl).split('\n').slice(1).join(' '),
        url: watchUrl || '/buddy-safety',
        tag: `buddy-safety-${trip.id}-${event.type}-${event.at || Date.now()}`,
        type: 'buddy-safety',
        senderUsername: trip.travellerUsername,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { ok: false, reason: 'push-send-failed' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || 'push-error' };
  }
}

export function buildNotifyLinks(trip, event, appOrigin) {
  const watchUrl = buildPublicWatchUrl(appOrigin, trip.shareToken);
  const message = formatAlertMessage(trip, event, watchUrl);
  const phone = trip.watcherPhone || '';
  return {
    watchUrl,
    message,
    whatsapp: buildWhatsAppUrl(phone, message),
    sms: buildSmsUrl(phone, message),
  };
}

/**
 * Notify family via Web Push (app closed OK), SMS, and WhatsApp.
 */
export async function dispatchTripAlerts(trip, events = [], { appOrigin = '' } = {}) {
  if (!events.length) return { sent: [], links: [], push: [] };

  const phone = normalizePhoneE164(trip.watcherPhone || '');
  const results = [];
  const links = [];
  const pushResults = [];

  for (const event of events) {
    const linkBundle = buildNotifyLinks(trip, event, appOrigin);
    links.push({ eventId: event.id, ...linkBundle });

    const pushResult = await sendWebPushToWatcher(trip, event, appOrigin);
    pushResults.push({ eventId: event.id, ...pushResult });

    if (!phone) continue;

    if (trip.watcherNotifyWhatsApp !== false) {
      if (twilioConfigured() && process.env.TWILIO_WHATSAPP_FROM) {
        const r = await twilioSend({ to: phone, body: linkBundle.message, channel: 'whatsapp' });
        results.push({ channel: 'whatsapp', eventId: event.id, ...r });
      }
    }

    if (trip.watcherNotifySms !== false) {
      if (twilioConfigured() && process.env.TWILIO_SMS_FROM) {
        const r = await twilioSend({ to: phone, body: linkBundle.message, channel: 'sms' });
        results.push({ channel: 'sms', eventId: event.id, ...r });
      }
    }
  }

  return {
    sent: results,
    links,
    push: pushResults,
    twilioEnabled: twilioConfigured(),
  };
}

export function resolveAppOrigin(req) {
  const envOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_ORIGIN || '').trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const host = String(req?.headers?.host || '').trim();
  if (!host) return '';
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${host}`;
}

export async function notifyTripStarted(trip, { appOrigin = '' } = {}) {
  const destLabel = trip.destination?.shortLabel || trip.destination?.label?.split(',')[0] || 'destination';
  const event = {
    id: `start-${trip.id}`,
    type: 'started',
    message: `Started trip to ${destLabel}. Live location is now shared.`,
    at: Date.now(),
  };
  return dispatchTripAlerts(trip, [event], { appOrigin });
}
