/**
 * Indian + global market context for NIFTY options optimizer.
 * VIX regimes, session windows, scheduled macro events, and volatility bias.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Known macro events relevant to NIFTY options (extend quarterly). */
const SCHEDULED_EVENTS = [
  { date: '2026-02-01', title: 'Union Budget', impact: 'high', region: 'IN' },
  { date: '2026-02-07', title: 'RBI Monetary Policy', impact: 'high', region: 'IN' },
  { date: '2026-03-19', title: 'FOMC Rate Decision', impact: 'high', region: 'US' },
  { date: '2026-04-08', title: 'RBI Monetary Policy', impact: 'high', region: 'IN' },
  { date: '2026-04-24', title: 'NIFTY Monthly Expiry', impact: 'medium', region: 'IN' },
  { date: '2026-05-07', title: 'RBI Monetary Policy', impact: 'high', region: 'IN' },
  { date: '2026-05-28', title: 'NIFTY Monthly Expiry', impact: 'medium', region: 'IN' },
  { date: '2026-06-05', title: 'RBI Monetary Policy', impact: 'high', region: 'IN' },
  { date: '2026-06-17', title: 'FOMC Rate Decision', impact: 'high', region: 'US' },
  { date: '2026-06-25', title: 'NIFTY Monthly Expiry', impact: 'medium', region: 'IN' },
  { date: '2026-07-09', title: 'RBI Monetary Policy', impact: 'high', region: 'IN' },
  { date: '2026-07-31', title: 'NIFTY Monthly Expiry', impact: 'medium', region: 'IN' },
  { date: '2026-08-06', title: 'RBI Monetary Policy', impact: 'high', region: 'IN' },
  { date: '2026-08-28', title: 'NIFTY Monthly Expiry', impact: 'medium', region: 'IN' },
  { date: '2026-09-04', title: 'US Jobs Report (NFP)', impact: 'medium', region: 'US' },
  { date: '2026-09-17', title: 'FOMC Rate Decision', impact: 'high', region: 'US' },
  { date: '2026-09-25', title: 'NIFTY Monthly Expiry', impact: 'medium', region: 'IN' },
];

const FAMILY_VIX_FIT = {
  'Iron Condor': { low: 1.0, medium: 0.95, high: 0.65, extreme: 0.4 },
  'Iron Butterfly': { low: 0.75, medium: 1.0, high: 0.8, extreme: 0.5 },
  'Jade Lizard': { low: 0.85, medium: 0.9, high: 0.85, extreme: 0.7 },
  'Twisted Sister': { low: 0.7, medium: 0.85, high: 0.9, extreme: 0.75 },
  'Ratio Condor (2x)': { low: 0.6, medium: 0.75, high: 0.85, extreme: 0.8 },
  'Strangle + Wings': { low: 0.65, medium: 0.8, high: 0.95, extreme: 0.9 },
  'Ratio Spread + Hedge': { low: 0.55, medium: 0.7, high: 0.9, extreme: 0.85 },
  'Double Condor (8-leg)': { low: 0.7, medium: 0.85, high: 0.7, extreme: 0.45 },
  'Bear Call Ladder': { low: 0.6, medium: 0.8, high: 0.9, extreme: 0.75 },
  'Bull Put Ladder': { low: 0.6, medium: 0.8, high: 0.9, extreme: 0.75 },
  'Layered Condor (6-leg)': { low: 0.65, medium: 0.85, high: 0.75, extreme: 0.5 },
  'Calendar CE Spread': { low: 0.8, medium: 0.95, high: 0.85, extreme: 0.6 },
  'Calendar PE Spread': { low: 0.8, medium: 0.95, high: 0.85, extreme: 0.6 },
  'Double Calendar': { low: 0.75, medium: 0.9, high: 0.8, extreme: 0.55 },
  'Calendar Condor': { low: 0.7, medium: 0.9, high: 0.75, extreme: 0.5 },
};

function nowIst() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

function formatIstTime(date = nowIst()) {
  const h = date.getUTCHours();
  const m = date.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm} IST`;
}

export function classifyVixRegime(vix) {
  const v = Number(vix) || 14;
  if (v < 12) return { regime: 'low', label: 'Low Vol (cheap premiums)', premiumBias: 'cheap', favor: 'Iron Condor, Jade Lizard, wide credit spreads' };
  if (v < 16) return { regime: 'medium', label: 'Normal Vol', premiumBias: 'fair', favor: 'Iron Butterfly, Iron Condor, calendars' };
  if (v < 22) return { regime: 'high', label: 'Elevated Vol (rich premiums)', premiumBias: 'rich', favor: 'Defined-risk strangles, ratio hedges, calendars' };
  return { regime: 'extreme', label: 'Extreme Vol (expensive / event risk)', premiumBias: 'expensive', favor: 'Hedged structures, reduce naked short gamma' };
}

function getActiveSessions(ist = nowIst()) {
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const day = ist.getUTCDay();
  const weekday = day >= 1 && day <= 5;

  return [
    {
      key: 'india',
      label: 'India (NSE)',
      open: weekday && mins >= 555 && mins <= 930,
      window: '9:15 AM – 3:30 PM IST',
      note: weekday ? (mins < 555 ? 'Pre-market' : mins > 930 ? 'Closed' : 'Live') : 'Weekend',
    },
    {
      key: 'europe',
      label: 'Europe (DAX/FTSE)',
      open: weekday && mins >= 555 && mins <= 1080,
      window: '12:30 PM – 12:00 AM IST',
      note: mins >= 555 && mins <= 660 ? 'European open — volatility often rises' : '',
    },
    {
      key: 'us',
      label: 'US (S&P/Dow)',
      open: weekday && mins >= 1140 || (weekday && mins <= 120),
      window: '7:00 PM – 1:30 AM IST',
      note: mins >= 1140 || mins <= 120 ? 'US session overlap — global risk-on/off' : '',
    },
  ];
}

function getUpcomingEvents(withinDays = 14) {
  const today = new Date();
  return SCHEDULED_EVENTS
    .map((event) => {
      const eventDate = new Date(`${event.date}T00:00:00+05:30`);
      const daysAway = Math.ceil((eventDate - today) / 86400000);
      return { ...event, daysAway, eventDate: event.date };
    })
    .filter((e) => e.daysAway >= 0 && e.daysAway <= withinDays)
    .sort((a, b) => a.daysAway - b.daysAway);
}

function computeGlobalVolBias(indices = {}) {
  const us = indices.SP500FUT || indices.DOWFUT;
  const europe = indices.DAX || indices.FTSE;
  const asia = indices.NIKKEI || indices.HANGSENG;
  const changes = [us?.changePercent, europe?.changePercent, asia?.changePercent].filter(Number.isFinite);
  if (!changes.length) return { bias: 'neutral', score: 0, detail: 'Global indices unavailable' };
  const avg = changes.reduce((s, v) => s + v, 0) / changes.length;
  if (avg > 0.35) return { bias: 'risk-on', score: avg, detail: 'Global markets positive — put skew may compress' };
  if (avg < -0.35) return { bias: 'risk-off', score: avg, detail: 'Global markets weak — hedges & put protection favored' };
  return { bias: 'neutral', score: avg, detail: 'Mixed global cues' };
}

function computeEventRisk(events, dteDays) {
  if (!events.length) return { penalty: 0, level: 'low', note: 'No major events in window' };
  const highSoon = events.find((e) => e.impact === 'high' && e.daysAway <= Math.max(3, dteDays * 0.5));
  if (highSoon) return { penalty: 0.35, level: 'high', note: `${highSoon.title} in ${highSoon.daysAway}d — widen wings or reduce size` };
  const mediumSoon = events.find((e) => e.daysAway <= 5);
  if (mediumSoon) return { penalty: 0.15, level: 'medium', note: `${mediumSoon.title} approaching` };
  return { penalty: 0, level: 'low', note: 'Event calendar clear near term' };
}

export function buildMarketContext({
  indiaVix = 14,
  niftySpot = null,
  indices = {},
  expiryDays = 7,
} = {}) {
  const vixInfo = classifyVixRegime(indiaVix);
  const sessions = getActiveSessions();
  const upcomingEvents = getUpcomingEvents(21);
  const globalVol = computeGlobalVolBias(indices);
  const eventRisk = computeEventRisk(upcomingEvents, expiryDays);
  const europeOpenWindow = sessions.find((s) => s.key === 'europe')?.note?.includes('European open');

  return {
    asOf: new Date().toISOString(),
    istTime: formatIstTime(),
    indiaVix: Number(indiaVix),
    niftySpot,
    vixRegime: vixInfo.regime,
    vixLabel: vixInfo.label,
    premiumBias: vixInfo.premiumBias,
    strategyHint: vixInfo.favor,
    sessions,
    globalVolBias: globalVol,
    eventRisk,
    europeOpenAlert: Boolean(europeOpenWindow),
    upcomingEvents: upcomingEvents.slice(0, 8),
    expiryDays,
    recommendedPosture:
      vixInfo.regime === 'extreme' ? 'Defensive — favor hedged multi-leg structures'
        : vixInfo.regime === 'low' ? 'Sell premium carefully — premiums are cheap'
          : eventRisk.level === 'high' ? 'Reduce size before macro event'
            : 'Balanced short-premium with wings',
  };
}

export function scoreFamilyForRegime(family, regime) {
  const table = FAMILY_VIX_FIT[family] || { low: 0.7, medium: 0.8, high: 0.75, extreme: 0.6 };
  return table[regime] ?? 0.7;
}

export function scoreCandidateWithFactors(candidate, marketContext) {
  const regime = marketContext?.vixRegime || 'medium';
  const vixFit = scoreFamilyForRegime(candidate.family, regime);
  const creditScore = Math.max(candidate.entryCredit, 0) / 100000;
  const rangeScore = (candidate.profitZoneWidth || 0) / 500;
  const riskScore = candidate.maxLoss >= 0 ? 1.5 : 1 / (Math.abs(candidate.maxLoss) / 100000 + 1);
  const rrScore = (candidate.rewardToRisk || 0) * 0.5;
  const eventPenalty = marketContext?.eventRisk?.penalty || 0;
  const globalAlign = marketContext?.globalVolBias?.bias === 'risk-off'
    ? (candidate.family?.includes('Put') || candidate.family?.includes('Hedge') ? 0.1 : 0)
    : 0;
  const skewBonus = marketContext?.premiumBias === 'rich' && candidate.entryCredit > 50000 ? 0.08 : 0;

  const composite = (
    vixFit * 0.28
    + creditScore * 0.18
    + rangeScore * 0.22
    + riskScore * 0.17
    + rrScore * 0.1
    + globalAlign
    + skewBonus
    - eventPenalty
  );

  return {
    compositeScore: Number(composite.toFixed(4)),
    factors: {
      vixFit: Number(vixFit.toFixed(3)),
      creditScore: Number(creditScore.toFixed(3)),
      rangeScore: Number(rangeScore.toFixed(3)),
      riskScore: Number(riskScore.toFixed(3)),
      rewardRisk: Number(rrScore.toFixed(3)),
      eventPenalty: Number(eventPenalty.toFixed(3)),
      globalAlign: Number(globalAlign.toFixed(3)),
      skewBonus: Number(skewBonus.toFixed(3)),
    },
  };
}

export const ADVANCED_PROFILES = [
  {
    key: 'hedging-optimized',
    label: 'Best Hedging Fit',
    description: 'Multi-factor score: VIX regime, event risk, global vol, profit zone & risk/reward.',
    useAdvanced: true,
  },
  {
    key: 'balanced',
    label: 'Best Overall',
    description: 'Balance of credit, limited loss, and wide profit zone.',
    useAdvanced: false,
  },
  {
    key: 'widest-range',
    label: 'Widest Profit Range',
    description: 'Largest spot range where strategy stays profitable at expiry.',
    useAdvanced: false,
  },
  {
    key: 'lowest-risk',
    label: 'Lowest Max Loss',
    description: 'Minimises worst-case loss with macro awareness.',
    useAdvanced: true,
  },
];
