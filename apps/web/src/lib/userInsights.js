import { computeDashboardStats, computeEntryScores } from './wellnessScoring';
import { readKnownChatContacts } from './chatPresence';

const TRANSACTION_COST_PER_ORDER = 30;
const WELLNESS_PREFIX = 'cosmix-wellness-';
const WELLNESS_GOALS_KEY = 'cosmix-wellness-goals';

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;

  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function sortEntriesDescending(entries = []) {
  return [...entries].sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

function normalizeWellnessEntries(entries = []) {
  return sortEntriesDescending(entries.filter((entry) => entry && entry.date));
}

function readWellnessEntries(userId) {
  if (!userId) return [];
  return normalizeWellnessEntries(parseStoredJson(`${WELLNESS_PREFIX}${userId}-entries`, []));
}

function readWellnessGoals() {
  return parseStoredJson(WELLNESS_GOALS_KEY, []).filter(Boolean);
}

function resolveCurrentEntry(entries = []) {
  const today = todayDate();
  return entries.find((entry) => entry.date === today) || entries[0] || { date: today };
}

function buildWellnessTrend(entries = []) {
  return [...entries]
    .slice(0, 7)
    .reverse()
    .map((entry) => {
      const scores = computeEntryScores(entry);
      return {
        label: String(entry.date || '').slice(5),
        value: scores.totalScore,
        physical: scores.physicalScore,
        mental: scores.mentalScore,
      };
    });
}

function computeRunningStreak(entries = []) {
  const runDays = normalizeWellnessEntries(entries).filter((entry) => Number(entry.runningDistanceKm || 0) > 0);
  if (!runDays.length) return 0;

  let streak = 1;
  for (let index = 1; index < runDays.length; index += 1) {
    const previous = new Date(runDays[index - 1].date);
    const current = new Date(runDays[index].date);
    const diffDays = Math.round((previous.getTime() - current.getTime()) / 86400000);
    if (diffDays === 1) {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
}

function computeFastestRunPace(entries = []) {
  const qualified = entries
    .filter((entry) => Number(entry.runningDistanceKm || 0) >= 2 && Number(entry.runningMinutes || 0) > 0)
    .map((entry) => Number(entry.runningMinutes || 0) / Number(entry.runningDistanceKm || 1));

  if (!qualified.length) return null;
  return Number(Math.min(...qualified).toFixed(2));
}

function computeCurrentWellnessScore(entry) {
  if (!entry || !entry.date) return 0;
  return Number((computeEntryScores(entry).totalScore || 0).toFixed(1));
}

function computeWeeklyAverageScore(entries = []) {
  const recentEntries = normalizeWellnessEntries(entries).slice(0, 7);
  if (!recentEntries.length) return 0;
  const total = recentEntries.reduce((sum, entry) => sum + Number(computeEntryScores(entry).totalScore || 0), 0);
  return Number((total / recentEntries.length).toFixed(1));
}

function buildProfitTrend(strategies = []) {
  const dailyTotals = new Map();

  strategies.forEach((strategy) => {
    (strategy?.transactions || []).forEach((transaction) => {
      const amount = Number(transaction?.amount || 0);
      const timestamp = String(transaction?.timestamp || '');
      if (!timestamp || !Number.isFinite(amount) || amount === 0) return;
      const day = timestamp.slice(0, 10);
      dailyTotals.set(day, Number((dailyTotals.get(day) || 0) + amount));
    });
  });

  if (!dailyTotals.size) return [];

  let runningTotal = 0;
  return [...dailyTotals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-10)
    .map(([day, amount]) => {
      runningTotal += Number(amount || 0);
      return {
        label: day.slice(5).replace('-', '/'),
        value: Number(runningTotal.toFixed(2)),
        dailyValue: Number(amount.toFixed(2)),
      };
    });
}

function buildProfitWindows(strategies = []) {
  const entries = [];

  strategies.forEach((strategy) => {
    (strategy?.transactions || []).forEach((transaction) => {
      const amount = Number(transaction?.amount || 0);
      const timestamp = String(transaction?.timestamp || '');
      if (!timestamp || !Number.isFinite(amount) || amount === 0) return;
      entries.push({
        amount,
        date: new Date(timestamp),
      });
    });
  });

  if (!entries.length) {
    return [
      { label: '1D P/L', value: 0 },
      { label: '1W P/L', value: 0 },
      { label: '1M P/L', value: 0 },
      { label: '1Y P/L', value: 0 },
    ];
  }

  const anchorTime = Math.max(...entries.map((entry) => entry.date.getTime()));
  const windows = [
    { label: '1D P/L', days: 1 },
    { label: '1W P/L', days: 7 },
    { label: '1M P/L', days: 30 },
    { label: '1Y P/L', days: 365 },
  ];

  return windows.map((window) => {
    const cutoff = anchorTime - ((window.days - 1) * 86400000);
    const total = entries.reduce((sum, entry) => {
      if (entry.date.getTime() < cutoff || entry.date.getTime() > anchorTime) return sum;
      return sum + entry.amount;
    }, 0);

    return {
      label: window.label,
      value: Number(total.toFixed(2)),
    };
  });
}

export function formatCurrency(value) {
  const numeric = Number(value || 0);
  const sign = numeric < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(numeric).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPace(value) {
  if (value == null) return 'No run above 2 km yet';
  return `${Number(value).toFixed(2)} min/km`;
}

export function calculateTransactionCost(transactions = []) {
  return (transactions || []).length * TRANSACTION_COST_PER_ORDER;
}

export function computeStrategyLiveMtm(strategy) {
  const lotSize = Number(strategy?.lotSize) || 65;
  return (strategy?.legs || []).reduce((sum, leg) => {
    const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const entry = Number(leg.premium) || 0;
    const current = Number(leg.marketPremium ?? leg.premium) || 0;
    return sum + (leg.side === 'SELL' ? (entry - current) * quantity * lotSize : (current - entry) * quantity * lotSize);
  }, 0);
}

export function computeStrategyRealized(strategy) {
  return (strategy?.closedLegs || []).reduce((sum, leg) => sum + (Number(leg.pnl) || 0), 0);
}

export function sampleSeries(points = [], maxPoints = 14) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]).filter(Boolean);
}

export function buildStrategySummary(strategies = []) {
  const active = strategies.filter((strategy) => strategy.status !== 'closed');
  const closed = strategies.filter((strategy) => strategy.status === 'closed');
  const openMtm = active.reduce((sum, strategy) => sum + computeStrategyLiveMtm(strategy), 0);
  const realized = closed.reduce((sum, strategy) => sum + (computeStrategyRealized(strategy) - calculateTransactionCost(strategy.transactions || [])), 0);
  const topPnl = strategies
    .map((strategy) => ({
      label: String(strategy.name || 'Unnamed').slice(0, 16),
      value: Number(((strategy.status === 'closed' ? 0 : computeStrategyLiveMtm(strategy)) + computeStrategyRealized(strategy) - calculateTransactionCost(strategy.transactions || [])).toFixed(2)),
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 5);
  const trackerSource = active[0] || strategies[0] || null;
  const trackerPoints = trackerSource?.liveMetrics?.points?.length
    ? sampleSeries(trackerSource.liveMetrics.points)
    : trackerSource?.snapshotMetrics?.points?.length
      ? sampleSeries(trackerSource.snapshotMetrics.points)
      : [];
  const profitTrend = buildProfitTrend(strategies);
  const profitWindows = buildProfitWindows(strategies);

  return {
    activeCount: active.length,
    closedCount: closed.length,
    totalStrategies: strategies.length,
    openMtm: Number(openMtm.toFixed(2)),
    realized: Number(realized.toFixed(2)),
    totalPnl: Number((openMtm + realized).toFixed(2)),
    trackerSource,
    trackerPoints,
    profitTrend,
    profitWindows,
    topPnl,
  };
}

export function buildWellnessSummary(userId) {
  const entries = readWellnessEntries(userId);
  const goals = readWellnessGoals();
  const currentEntry = resolveCurrentEntry(entries);
  const dashboardStats = computeDashboardStats(entries, currentEntry);
  const scoredRows = entries.map((entry) => computeEntryScores(entry));
  const completedGoals = goals.filter((goal) => {
    const status = String(goal?.status || '').toLowerCase();
    return Boolean(goal?.completedAt) || status === 'done' || status === 'completed';
  }).length;

  return {
    entries,
    goals,
    currentEntry,
    dashboardStats,
    trendPoints: buildWellnessTrend(entries),
    totalFitnessScore: Number(scoredRows.reduce((sum, scores) => sum + Number(scores.totalScore || 0), 0).toFixed(2)),
    runningStreak: computeRunningStreak(entries),
    highestRunKm: Number(Math.max(0, ...entries.map((entry) => Number(entry.runningDistanceKm || 0))).toFixed(2)),
    fastestRunPace: computeFastestRunPace(entries),
    currentWellnessScore: computeCurrentWellnessScore(currentEntry),
    weeklyAverageWellnessScore: computeWeeklyAverageScore(entries),
    plannedGoals: goals.length,
    completedGoals,
  };
}

export function buildProfileInsights({ strategies = [], userId }) {
  const strategySummary = buildStrategySummary(strategies);
  const wellnessSummary = buildWellnessSummary(userId);
  const contacts = readKnownChatContacts(userId);

  return {
    totalProfit: strategySummary.totalPnl,
    totalFitnessScore: wellnessSummary.totalFitnessScore,
    totalFriends: contacts.length,
    runningStreak: wellnessSummary.runningStreak,
    highestRunKm: wellnessSummary.highestRunKm,
    fastestRunPace: wellnessSummary.fastestRunPace,
    weeklyRunningKm: wellnessSummary.dashboardStats.weeklyRunningKm,
    activeDays: wellnessSummary.dashboardStats.activeDays,
    currentWellnessScore: wellnessSummary.currentWellnessScore,
    weeklyAverageWellnessScore: wellnessSummary.weeklyAverageWellnessScore,
    plannedGoals: wellnessSummary.plannedGoals,
    completedGoals: wellnessSummary.completedGoals,
  };
}