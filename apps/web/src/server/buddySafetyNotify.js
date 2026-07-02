import {
  buildPublicWatchUrl,
  buildSmsUrl,
  buildWhatsAppUrl,
  formatAlertMessage,
  normalizePhoneE164,
} from '../lib/buddySafetyLinks';

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
 * Send SMS / WhatsApp alerts to the watcher when trip events fire.
 * Falls back to returning deep links when Twilio is not configured.
 */
export async function dispatchTripAlerts(trip, events = [], { appOrigin = '' } = {}) {
  if (!events.length) return { sent: [], links: [] };

  const phone = normalizePhoneE164(trip.watcherPhone || '');
  const channels = trip.alertChannels || { sms: true, whatsapp: true };
  const results = [];
  const links = [];

  for (const event of events) {
    const linkBundle = buildNotifyLinks(trip, event, appOrigin);
    links.push({ eventId: event.id, ...linkBundle });

    if (!phone) continue;

    if (channels.whatsapp && trip.watcherNotifyWhatsApp !== false) {
      if (twilioConfigured() && process.env.TWILIO_WHATSAPP_FROM) {
        const r = await twilioSend({ to: phone, body: linkBundle.message, channel: 'whatsapp' });
        results.push({ channel: 'whatsapp', eventId: event.id, ...r });
      }
    }

    if (channels.sms && trip.watcherNotifySms !== false) {
      if (twilioConfigured() && process.env.TWILIO_SMS_FROM) {
        const r = await twilioSend({ to: phone, body: linkBundle.message, channel: 'sms' });
        results.push({ channel: 'sms', eventId: event.id, ...r });
      }
    }
  }

  return { sent: results, links, twilioEnabled: twilioConfigured() };
}

export function resolveAppOrigin(req) {
  const envOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_ORIGIN || '').trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const host = String(req?.headers?.host || '').trim();
  if (!host) return '';
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${host}`;
}
