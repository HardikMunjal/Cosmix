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

function computeLongestRunningStreak(entries = []) {
  const runDates = normalizeWellnessEntries(entries)
    .filter((entry) => Number(entry.runningDistanceKm || 0) > 0)
    .map((entry) => String(entry.date || ''))
    .filter(Boolean)
    .reverse();

  if (!runDates.length) return 0;

  let best = 1;
  let current = 1;
  for (let index = 1; index < runDates.length; index += 1) {
    const prev = new Date(runDates[index - 1]);
    const now = new Date(runDates[index]);
    const diffDays = Math.round((now.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }

  return best;
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

function computeMaxWellnessScore(entries = []) {
  if (!entries.length) return 0;
  const max = entries.reduce((best, entry) => {
    const score = Number(computeEntryScores(entry).totalScore || 0);
    return score > best ? score : best;
  }, 0);
  return Number(max.toFixed(1));
}

function computeLongestRun(entries = []) {
  const runs = entries
    .map((entry) => ({
      date: entry?.date || null,
      distanceKm: Number(entry?.runningDistanceKm || 0),
      runningMinutes: Number(entry?.runningMinutes || 0),
    }))
    .filter((entry) => Number.isFinite(entry.distanceKm) && entry.distanceKm > 0);

  if (!runs.length) {
    return {
      distanceKm: null,
      runningMinutes: null,
      date: null,
    };
  }

  const best = runs.reduce((prev, curr) => {
    if (curr.distanceKm > prev.distanceKm) return curr;
    if (curr.distanceKm === prev.distanceKm && curr.runningMinutes > prev.runningMinutes) return curr;
    return prev;
  }, runs[0]);

  return {
    distanceKm: Number(best.distanceKm.toFixed(2)),
    runningMinutes: Number.isFinite(best.runningMinutes) && best.runningMinutes > 0 ? Number(best.runningMinutes.toFixed(1)) : null,
    date: best.date || null,
  };
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
    longestRunningStreak: computeLongestRunningStreak(entries),
    highestRunKm: Number(Math.max(0, ...entries.map((entry) => Number(entry.runningDistanceKm || 0))).toFixed(2)),
    longestRun: computeLongestRun(entries),
    fastestRunPace: computeFastestRunPace(entries),
    currentWellnessScore: computeCurrentWellnessScore(currentEntry),
    weeklyAverageWellnessScore: computeWeeklyAverageScore(entries),
    maxWellnessScore: computeMaxWellnessScore(entries),
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
    longestRunningStreak: wellnessSummary.longestRunningStreak,
    highestRunKm: wellnessSummary.highestRunKm,
    longestRun: wellnessSummary.longestRun,
    fastestRunPace: wellnessSummary.fastestRunPace,
    weeklyRunningKm: wellnessSummary.dashboardStats.weeklyRunningKm,
    activeDays: wellnessSummary.dashboardStats.activeDays,
    currentWellnessScore: wellnessSummary.currentWellnessScore,
    weeklyAverageWellnessScore: wellnessSummary.weeklyAverageWellnessScore,
    maxWellnessScore: wellnessSummary.maxWellnessScore,
    plannedGoals: wellnessSummary.plannedGoals,
    completedGoals: wellnessSummary.completedGoals,
  };
}

// ───── Trading Analytics ─────
export function buildDayWiseProfitLoss(strategies = []) {
  const dailyMap = new Map();
  
  strategies.forEach((strategy) => {
    (strategy?.transactions || []).forEach((transaction) => {
      const amount = Number(transaction?.amount || 0);
      const timestamp = String(transaction?.timestamp || '');
      if (!timestamp || !Number.isFinite(amount) || amount === 0) return;
      const day = timestamp.slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + amount);
    });
  });

  return [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, amount]) => ({
      date: day,
      label: day.slice(5),
      profit: amount >= 0 ? amount : 0,
      loss: amount < 0 ? Math.abs(amount) : 0,
      net: amount,
    }));
}

export function computeDailyStats(strategies = []) {
  const dayWise = buildDayWiseProfitLoss(strategies);
  if (!dayWise.length) {
    return {
      bestDay: null,
      worstDay: null,
      lastWeekPL: 0,
      totalPL: 0,
    };
  }

  const bestDay = [...dayWise].sort((a, b) => b.net - a.net)[0];
  const worstDay = [...dayWise].sort((a, b) => a.net - b.net)[0];
  
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  
  const lastWeekPL = dayWise
    .filter((d) => d.date >= weekAgoStr)
    .reduce((sum, d) => sum + d.net, 0);
  
  const totalPL = dayWise.reduce((sum, d) => sum + d.net, 0);

  return {
    bestDay,
    worstDay,
    lastWeekPL: Number(lastWeekPL.toFixed(2)),
    totalPL: Number(totalPL.toFixed(2)),
  };
}

export function computeStrategyStats(strategies = []) {
  const stratStats = strategies
    .filter((s) => s && s.name)
    .map((strategy) => {
      const realized = (strategy?.closedLegs || []).reduce((sum, leg) => sum + (Number(leg.pnl) || 0), 0);
      const unrealized = (strategy?.legs || []).reduce((sum, leg) => {
        const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
        const entry = Number(leg.premium) || 0;
        const current = Number(leg.marketPremium ?? leg.premium) || 0;
        const lotSize = Number(strategy.lotSize) || 65;
        return sum + (leg.side === 'SELL' ? (entry - current) * qty * lotSize : (current - entry) * qty * lotSize);
      }, 0);
      const totalCost = calculateTransactionCost(strategy.transactions || []);
      const totalPnl = realized + unrealized - totalCost;

      return {
        name: String(strategy.name || 'Unnamed').slice(0, 20),
        realized: Number(realized.toFixed(2)),
        unrealized: Number(unrealized.toFixed(2)),
        totalCost,
        totalPnl: Number(totalPnl.toFixed(2)),
        status: strategy.status || 'active',
      };
    });

  const mostProfit = [...stratStats].sort((a, b) => b.totalPnl - a.totalPnl)[0];
  const mostLoss = [...stratStats].sort((a, b) => a.totalPnl - b.totalPnl)[0];

  return {
    all: stratStats,
    mostProfit,
    mostLoss,
  };
}

// ───── Running/Wellness Analytics ─────
export function computeRunningStats(userId) {
  const entries = readWellnessEntries(userId);
  const runs = entries
    .filter((e) => Number(e.runningDistanceKm || 0) > 0 && Number(e.runningMinutes || 0) > 0)
    .map((e) => ({
      date: e.date,
      distance: Number(e.runningDistanceKm),
      minutes: Number(e.runningMinutes),
      speed: Number(e.runningDistanceKm) / (Number(e.runningMinutes) / 60),
      pace: Number(e.runningMinutes) / Number(e.runningDistanceKm),
    }));

  if (!runs.length) {
    return {
      totalRuns: 0,
      totalDistance: 0,
      averageSpeed: 0,
      averagePace: null,
      fastestSpeed: null,
      fastestSpeedRun: null,
      slowestSpeed: null,
      slowestSpeedRun: null,
      longestDistance: null,
      longestDistanceRun: null,
      fastestDistanceRun: null,
      topDistances: [],
      topSpeeds: [],
    };
  }

  const qualifiedSpeed = runs.filter((r) => r.distance >= 2);
  const totalDistance = runs.reduce((sum, r) => sum + r.distance, 0);
  const avgSpeed = totalDistance / runs.reduce((sum, r) => sum + r.minutes, 0) * 60;

  const fastestSpeedRun = qualifiedSpeed.length ? qualifiedSpeed.sort((a, b) => b.speed - a.speed)[0] : null;
  const slowestSpeedRun = qualifiedSpeed.length ? qualifiedSpeed.sort((a, b) => a.speed - b.speed)[0] : null;
  const longestDistanceRun = runs.sort((a, b) => b.distance - a.distance)[0];
  const fastestDistanceRun = runs.sort((a, b) => b.speed - a.speed)[0];

  return {
    totalRuns: runs.length,
    totalDistance: Number(totalDistance.toFixed(1)),
    averageSpeed: Number(avgSpeed.toFixed(2)),
    averagePace: runs.length > 0 ? Number((runs.reduce((sum, r) => sum + r.pace, 0) / runs.length).toFixed(2)) : null,
    fastestSpeed: fastestSpeedRun ? Number(fastestSpeedRun.speed.toFixed(2)) : null,
    fastestSpeedRun: fastestSpeedRun ? {
      date: fastestSpeedRun.date,
      distance: Number(fastestSpeedRun.distance.toFixed(1)),
      time: `${Math.floor(fastestSpeedRun.minutes)}m`,
      speed: Number(fastestSpeedRun.speed.toFixed(2)),
    } : null,
    slowestSpeed: slowestSpeedRun ? Number(slowestSpeedRun.speed.toFixed(2)) : null,
    slowestSpeedRun: slowestSpeedRun ? {
      date: slowestSpeedRun.date,
      distance: Number(slowestSpeedRun.distance.toFixed(1)),
      time: `${Math.floor(slowestSpeedRun.minutes)}m`,
      speed: Number(slowestSpeedRun.speed.toFixed(2)),
    } : null,
    longestDistance: longestDistanceRun ? Number(longestDistanceRun.distance.toFixed(1)) : null,
    longestDistanceRun: longestDistanceRun ? {
      date: longestDistanceRun.date,
      distance: Number(longestDistanceRun.distance.toFixed(1)),
      time: `${Math.floor(longestDistanceRun.minutes)}m`,
      speed: Number(longestDistanceRun.speed.toFixed(2)),
    } : null,
    fastestDistanceRun: fastestDistanceRun ? {
      date: fastestDistanceRun.date,
      distance: Number(fastestDistanceRun.distance.toFixed(1)),
      time: `${Math.floor(fastestDistanceRun.minutes)}m`,
      speed: Number(fastestDistanceRun.speed.toFixed(2)),
    } : null,
    topDistances: runs
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 5)
      .map((r) => ({
        date: r.date,
        distance: Number(r.distance.toFixed(1)),
        time: `${Math.floor(r.minutes)}m`,
        speed: Number(r.speed.toFixed(2)),
      })),
    topSpeeds: qualifiedSpeed
      .sort((a, b) => b.speed - a.speed)
      .slice(0, 5)
      .map((r) => ({
        date: r.date,
        distance: Number(r.distance.toFixed(1)),
        time: `${Math.floor(r.minutes)}m`,
        speed: Number(r.speed.toFixed(2)),
      })),
  };
}

export function computeWellnessStats(userId) {
  const entries = readWellnessEntries(userId);
  const scoredEntries = entries
    .map((entry) => ({
      date: entry.date,
      score: computeEntryScores(entry).totalScore,
      physical: computeEntryScores(entry).physicalScore,
      mental: computeEntryScores(entry).mentalScore,
    }))
    .sort((a, b) => b.score - a.score);

  const highestScore = scoredEntries[0] || null;
  
  return {
    entries,
    scoredEntries,
    highestScore,
    topScores: scoredEntries.slice(0, 5),
  };
}