import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';

import {
  DEFAULT_FORM,
  LANGUAGE_OPTIONS,
  formatMetric,
  formatUpdateList,
  parseActivityCommand,
  todayDate,
} from '../lib/wellnessParsing';
import {
  DAILY_PENALTY,
  computeDashboardStats,
  computeEntryScores,
  DEFAULT_SCORING_RULES,
  normalizeScoringRules,
} from '../lib/wellnessScoring';

const STORAGE_LANG_KEY = 'cosmix-henna-language';
function storageKey(userId, suffix) { return `cosmix-wellness-${userId}-${suffix}`; }

function formatDisplayDate(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function summarizeAddedActivities(selectedDate, activityNames, updates) {
  const uniqueActivityNames = Array.from(new Set(activityNames.filter(Boolean)));
  const activityLabel = uniqueActivityNames.length ? uniqueActivityNames.join(', ') : 'Activity';
  return `Added on ${formatDisplayDate(selectedDate)}: ${activityLabel} - ${formatUpdateList(updates)}`;
}

function inferActivityNamesFromUpdates(updates) {
  return Array.from(new Set(updates.map((update) => {
    if (update.key.startsWith('running')) return 'Running';
    if (update.key.startsWith('cycling')) return 'Cycling';
    if (update.key.startsWith('walking')) return 'Walking';
    if (update.key === 'exerciseMinutes') return 'Workout';
    if (update.key === 'badmintonMinutes') return 'Badminton';
    if (update.key === 'yogaMinutes') return 'Yoga';
    if (update.key === 'footballMinutes') return 'Football';
    if (update.key === 'cricketMinutes') return 'Cricket';
    if (update.key === 'swimmingMinutes') return 'Swimming';
    if (update.key === 'meditationMinutes') return 'Meditation';
    if (update.key === 'whiskyPegs') return 'Whisky';
    if (update.key === 'fastFoodServings') return 'Fast food';
    if (update.key === 'sugarServings') return 'Sugar';
    if (update.key === 'sleepHours') return 'Sleep';
    return update.label;
  })));
}

function isAdminUser(user) {
  const username = String(user?.username || '').trim().toLowerCase();
  const email = String(user?.email || '').trim().toLowerCase();
  return user?.id === 'usr-hardi' || username === 'hardi' || email === 'hardik.munjaal@gmail.com';
}

function formatFormula(multiplier, divisor, unit) {
  if (!multiplier) return '0';
  if (divisor === 1) return `${unit} x ${formatMetric(multiplier)}`;
  return `(${unit} / ${formatMetric(divisor)}) x ${formatMetric(multiplier)}`;
}

const SCORE_FIELDS = [
  'runningMinutes', 'runningDistanceKm', 'cyclingMinutes', 'cyclingDistanceKm', 'walkingMinutes', 'walkingDistanceKm',
  'exerciseMinutes', 'yogaMinutes', 'badmintonMinutes', 'footballMinutes',
  'cricketMinutes', 'swimmingMinutes', 'meditationMinutes', 'whiskyPegs',
  'fastFoodServings', 'sugarServings', 'headacheLevel', 'sleepHours',
];

function hasScorableData(entry) {
  if (!entry) return false;
  return SCORE_FIELDS.some((field) => Number(entry[field] || 0) > 0);
}

const ZERO_SCORES = {
  physicalScore: 0,
  mentalScore: 0,
  totalScore: 0,
  physicalPenalty: 0,
  mentalPenalty: 0,
  sleepPhysical: 0,
  sleepMental: 0,
  workoutMinutes: 0,
};

/* ---------- activity dropdown config ---------- */
const ACTIVITY_OPTIONS = [
  { id: 'running', label: 'Running', icon: '🏃', fields: [{ key: 'runningDistanceKm', label: 'Distance', unit: 'km', step: 0.1 }, { key: 'runningMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'cycling', label: 'Cycling', icon: '🚴', fields: [{ key: 'cyclingDistanceKm', label: 'Distance', unit: 'km', step: 0.1 }, { key: 'cyclingMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'walking', label: 'Walking', icon: '🚶', fields: [{ key: 'walkingDistanceKm', label: 'Distance', unit: 'km', step: 0.1 }, { key: 'walkingMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'exercise', label: 'Workout', icon: '💪', fields: [{ key: 'exerciseMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'yoga', label: 'Yoga', icon: '🧘', fields: [{ key: 'yogaMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'badminton', label: 'Badminton', icon: '🏸', fields: [{ key: 'badmintonMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'football', label: 'Football', icon: '⚽', fields: [{ key: 'footballMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'cricket', label: 'Cricket', icon: '🏏', fields: [{ key: 'cricketMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'swimming', label: 'Swimming', icon: '🏊', fields: [{ key: 'swimmingMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'meditation', label: 'Meditation', icon: '🧘', fields: [{ key: 'meditationMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'whisky', label: 'Whisky', icon: '🥃', fields: [{ key: 'whiskyPegs', label: 'Pegs', unit: 'pegs', step: 1 }] },
  { id: 'fastfood', label: 'Fast food', icon: '🍔', fields: [{ key: 'fastFoodServings', label: 'Count', unit: 'count', step: 1 }] },
  { id: 'sugar', label: 'Sugar', icon: '🍬', fields: [{ key: 'sugarServings', label: 'Count', unit: 'count', step: 1 }] },
  { id: 'sleep', label: 'Sleep', icon: '😴', fields: [{ key: 'sleepHours', label: 'Hours', unit: 'hrs', step: 0.5 }] },
];

/* ---------- helpers ---------- */
function parseStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

function sortDailyScoresByDate(dailyScores = []) {
  return [...(Array.isArray(dailyScores) ? dailyScores : [])].sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

function computeLatestCumulativeScore(dailyScores = []) {
  const ordered = sortDailyScoresByDate(dailyScores);
  const latest = ordered[ordered.length - 1];
  if (!latest) return 0;
  const direct = Number(latest.cumulativeTotalScore || 0);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  return ordered.reduce((sum, score) => sum + Number(score.totalScore || 0), 0);
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

function weatherDesc(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
}

function MountainBg() {
  return (
    <div style={s.bgWrap} aria-hidden="true">
      <div style={s.bgSky} />
      <div style={s.bgGlow} />
      <svg style={s.bgMountains} viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">
        <polygon points="0,600 0,280 220,180 420,250 650,120 890,230 1130,150 1440,240 1440,600" fill="rgba(255,255,255,0.12)" />
        <polygon points="0,600 0,360 180,310 410,360 640,250 860,300 1080,240 1280,300 1440,270 1440,600" fill="rgba(17,24,39,0.42)" />
        <polygon points="0,600 0,430 170,400 340,430 520,390 720,420 940,382 1140,430 1440,390 1440,600" fill="rgba(15,23,42,0.78)" />
      </svg>
    </div>
  );
}

/* ================================================ */
export default function WellnessPage() {
  const router = useRouter();
  const recognitionRef = useRef(null);
  const recognitionActiveRef = useRef(false);
  const initDoneRef = useRef(false);
  const userIdRef = useRef(null);
  const transactionLogsRef = useRef(null);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedActivity, setSelectedActivity] = useState('');
  const [fieldValues, setFieldValues] = useState({});
  const [commandInput, setCommandInput] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('Mic ready');
  const [voiceLanguage, setVoiceLanguage] = useState('hi-IN');
  const [weather, setWeather] = useState(null);
  const [inputMode, setInputMode] = useState('dropdown');
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaMsg, setStravaMsg] = useState('');
  const [planInfo, setPlanInfo] = useState(null);
  const [planStartDate, setPlanStartDate] = useState(todayDate());
  const [dailyScores, setDailyScores] = useState([]);
  const [planTransactions, setPlanTransactions] = useState([]);
  const [showPlanTransactions, setShowPlanTransactions] = useState(false);
  const [showScoringRules, setShowScoringRules] = useState(false);
  const [scoringRules, setScoringRules] = useState(DEFAULT_SCORING_RULES);
  const [showCreatePlanForm, setShowCreatePlanForm] = useState(false);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showRenamePlanForm, setShowRenamePlanForm] = useState(false);
  const [planNameDraft, setPlanNameDraft] = useState('');
  const [allPlans, setAllPlans] = useState([]);
  const [historyPlan, setHistoryPlan] = useState(null);
  const [showPlanHistory, setShowPlanHistory] = useState(false);
  const [buddyPlanRows, setBuddyPlanRows] = useState([]);
  const [buddyPlanLoading, setBuddyPlanLoading] = useState(false);

  const showMicSecurityWarning = typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost';

  const configuredWellnessApiBase = process.env.NEXT_PUBLIC_WELLNESS_API_BASE || '';
  const API_BASE = configuredWellnessApiBase || (typeof window !== 'undefined'
    ? ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${window.location.protocol}//${window.location.hostname}:3004`
      : '')
    : '');
  const saveTimerRef = useRef(null);
  const suppressSyncCountRef = useRef(0);

  function applyServerState(serverData, options = {}) {
    const { syncLocal = false } = options;
    if (!serverData) return;
    const nextEntries = Array.isArray(serverData.entries) ? serverData.entries : [];
    const nextForm = { ...DEFAULT_FORM, ...(serverData.form || {}), date: String(serverData.form?.date || todayDate()).slice(0, 10) };
    suppressSyncCountRef.current += 2;
    setEntries(nextEntries);
    setForm(nextForm);
    setPlanInfo(serverData.plan || null);
    setPlanNameDraft(serverData.plan?.name || '');
    setDailyScores(Array.isArray(serverData.dailyScores) ? serverData.dailyScores : []);
    setPlanTransactions(Array.isArray(serverData.planTransactions) ? serverData.planTransactions : []);
    setAllPlans(Array.isArray(serverData.plans) ? serverData.plans : []);
    if (serverData.plan?.startDate) {
      setPlanStartDate(serverData.plan.startDate);
    }
    if (serverData.scoringRules) {
      setScoringRules(normalizeScoringRules(serverData.scoringRules));
    }
    if (syncLocal && typeof window !== 'undefined' && userIdRef.current) {
      localStorage.setItem(storageKey(userIdRef.current, 'entries'), JSON.stringify(nextEntries));
      localStorage.setItem(storageKey(userIdRef.current, 'form'), JSON.stringify(nextForm));
    }
  }

  /* ---- init (runs once) ---- */
  useEffect(() => {
    if (typeof window === 'undefined' || initDoneRef.current) return;
    restoreUserSession(router, setUser).then((parsed) => {
      if (!parsed) return;
      const uid = parsed.id || parsed.email || parsed.username || 'default';
      userIdRef.current = uid;

      const localEntries = parseStoredJson(storageKey(uid, 'entries'), []);
      const localForm = parseStoredJson(storageKey(uid, 'form'), DEFAULT_FORM);
      const today = todayDate();
      const todayEntry = localEntries.find((e) => e.date === today);
      const resolvedForm = todayEntry || { ...DEFAULT_FORM, ...localForm, date: today };
      setEntries(localEntries);
      setForm(resolvedForm);
      setSelectedDate(today);
      setPlanStartDate(today);
      const storedLanguage = localStorage.getItem(STORAGE_LANG_KEY);
      if (storedLanguage && LANGUAGE_OPTIONS.some((o) => o.value === storedLanguage)) setVoiceLanguage(storedLanguage);
      initDoneRef.current = true;
      setLoading(false);

      fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((serverData) => {
          if (!serverData) return;
          applyServerState(serverData, { syncLocal: true });
        })
        .catch(() => {});

      const urlParams = new URLSearchParams(window.location.search);
      const stravaResult = urlParams.get('strava');
      if (stravaResult) {
        window.history.replaceState({}, '', window.location.pathname);
        if (stravaResult === 'ok') {
          setStravaConnected(true);
          setStravaMsg('Strava connected! Syncing activities...');
          fetch(`${API_BASE}/wellness/strava/activities/${encodeURIComponent(uid)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((actData) => {
              if (!actData?.fields || Object.keys(actData.fields).length === 0) {
                setStravaMsg('Strava connected! No activities found today.');
                return;
              }
              setStravaMsg(`Strava connected! Synced ${actData.activities} activities`);
              setForm((prev) => {
                const updated = { ...prev };
                for (const [key, val] of Object.entries(actData.fields)) {
                  if (!updated[key] || updated[key] === 0) updated[key] = val;
                }
                return updated;
              });
            })
            .catch(() => setStravaMsg('Strava connected but sync failed'));
        } else {
          setStravaMsg('Strava authorization failed. Try again.');
        }
      }

      fetch(`${API_BASE}/wellness/strava/status/${encodeURIComponent(uid)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d?.connected) return;
          setStravaConnected(true);
          return fetch(`${API_BASE}/wellness/strava/activities/${encodeURIComponent(uid)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((actData) => {
              if (!actData?.fields || Object.keys(actData.fields).length === 0) return;
              setStravaMsg(`Strava: ${actData.activities} activities synced`);
              setForm((prev) => {
                const updated = { ...prev };
                for (const [key, val] of Object.entries(actData.fields)) {
                  if (!updated[key] || updated[key] === 0) updated[key] = val;
                }
                return updated;
              });
            });
        })
        .catch(() => {});
    });
  }, [API_BASE, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    async function loadBuddyLeaderboard() {
      const selfUserId = String(userIdRef.current || user?.id || user?.email || user?.username || '').trim();
      const selfUsername = String(user?.username || '').trim();
      if (!selfUserId || !selfUsername) {
        if (!cancelled) setBuddyPlanRows([]);
        return;
      }

      setBuddyPlanLoading(true);
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';
        const chatApiBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';

        const bootstrapResponse = await fetch(`${chatApiBase}/bootstrap?username=${encodeURIComponent(selfUsername)}`);
        const bootstrapData = await bootstrapResponse.json().catch(() => ({}));
        const friends = Array.isArray(bootstrapData?.friends) ? bootstrapData.friends : [];

        const buddyLookups = await Promise.all(friends.map(async (username) => {
          const normalized = String(username || '').trim();
          if (!normalized) return null;
          try {
            const searchResponse = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(normalized)}`);
            const searchData = await searchResponse.json();
            const match = (Array.isArray(searchData?.results) ? searchData.results : [])
              .find((entry) => String(entry?.username || '').toLowerCase() === normalized.toLowerCase());
            const buddyUserId = String(match?.id || match?.email || match?.username || normalized).trim();
            return { username: normalized, displayName: String(match?.name || match?.username || normalized).trim(), userId: buddyUserId };
          } catch (_) {
            return { username: normalized, displayName: normalized, userId: normalized };
          }
        }));

        const participants = [
          {
            username: selfUsername,
            displayName: 'You',
            userId: selfUserId,
            isSelf: true,
          },
          ...buddyLookups.filter(Boolean).map((entry) => ({ ...entry, isSelf: false })),
        ];

        const uniqueParticipants = Array.from(new Map(participants.map((entry) => [String(entry.userId).toLowerCase(), entry])).values());

        const leaderboardRows = await Promise.all(uniqueParticipants.map(async (participant) => {
          try {
            const response = await fetch(`${API_BASE}/wellness/data/${encodeURIComponent(participant.userId)}`);
            const data = await response.json();
            if (!response.ok || !data?.plan || data.plan.status !== 'active') return null;
            const sortedScores = sortDailyScoresByDate(data.dailyScores || []);
            const latestScore = sortedScores[sortedScores.length - 1] || null;
            const cumulativeTotal = computeLatestCumulativeScore(sortedScores);
            return {
              id: participant.userId,
              name: participant.displayName,
              username: participant.username,
              isSelf: participant.isSelf,
              planName: String(data.plan.name || 'Active plan'),
              planStartDate: data.plan.startDate,
              cumulativeTotal,
              lastDayScore: Number(latestScore?.totalScore || 0),
              days: sortedScores.length,
              series: sortedScores.map((score) => ({
                date: score.date,
                cumulative: Number(score.cumulativeTotalScore || 0),
              })),
            };
          } catch (_) {
            return null;
          }
        }));

        const ranked = leaderboardRows
          .filter(Boolean)
          .sort((left, right) => Number(right.cumulativeTotal || 0) - Number(left.cumulativeTotal || 0));

        if (!cancelled) setBuddyPlanRows(ranked);
      } catch (_) {
        if (!cancelled) setBuddyPlanRows([]);
      } finally {
        if (!cancelled) setBuddyPlanLoading(false);
      }
    }

    loadBuddyLeaderboard();
    return () => { cancelled = true; };
  }, [API_BASE, user?.id, user?.email, user?.username, planInfo?.id, dailyScores.length]);

  /* ---- sync to server (debounced) ---- */
  function syncToServer(newEntries, newForm) {
    const uid = userIdRef.current;
    if (!uid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const formEntry = { ...newForm, date: String(newForm?.date || selectedDate || todayDate()).slice(0, 10) };
      const payloadEntries = hasScorableData(formEntry)
        ? [formEntry, ...newEntries.filter((entry) => entry.date !== formEntry.date)]
        : newEntries;
      fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: payloadEntries, form: newForm }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Sync failed with status ${r.status}`);
          return r.json();
        })
        .catch((error) => {
          // Keep optimistic local state when server sync fails.
          console.warn('Wellness sync failed:', error);
        });
    }, 1500);
  }

  function handleStartPlan() {
    const uid = userIdRef.current;
    if (!uid || !planStartDate) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    fetch(`${API_BASE}/wellness/plan/${encodeURIComponent(uid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: planStartDate,
        name: planNameDraft,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((serverData) => {
        if (!serverData) return;
        applyServerState(serverData, { syncLocal: true });
        setShowPlanTransactions(false);
        setShowCreatePlanForm(false);
        setShowRenamePlanForm(false);
        setShowPlanMenu(false);
        setAssistantReply(`Plan ${serverData.plan?.name || ''} started from ${planStartDate}. Earlier active plan data is now inactive.`.trim());
      })
      .catch(() => setAssistantReply('Could not start the plan right now.'));
  }

  function handleRenamePlan() {
    const uid = userIdRef.current;
    if (!uid || !planInfo?.id || !String(planNameDraft || '').trim()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    fetch(`${API_BASE}/wellness/plan/${encodeURIComponent(uid)}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: planNameDraft.trim() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((serverData) => {
        if (!serverData) return;
        applyServerState(serverData, { syncLocal: true });
        setShowRenamePlanForm(false);
        setShowPlanMenu(false);
        setAssistantReply(`Plan renamed to ${serverData.plan?.name || planNameDraft.trim()}.`);
      })
      .catch(() => setAssistantReply('Could not rename the active plan right now.'));
  }

  function handleResetCurrentPlan() {
    const uid = userIdRef.current;
    if (!uid || !planInfo?.id) return;
    if (typeof window !== 'undefined' && !window.confirm(`Reset ${planInfo.name}? This will mark current plan data inactive and remove it from calculation.`)) {
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    fetch(`${API_BASE}/wellness/plan/${encodeURIComponent(uid)}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((serverData) => {
        if (!serverData) return;
        applyServerState(serverData, { syncLocal: true });
        setShowPlanTransactions(false);
        setShowCreatePlanForm(false);
        setShowRenamePlanForm(false);
        setShowPlanMenu(false);
        setAssistantReply(`Current plan data for ${planInfo.name} is now inactive and excluded from score calculation.`);
      })
      .catch(() => setAssistantReply('Could not reset the current plan right now.'));
  }

  function handleClosePlan() {
    const uid = userIdRef.current;
    if (!uid || !planInfo?.id) return;
    if (typeof window !== 'undefined' && !window.confirm(`Close "${planInfo.name}"? All logged data will be saved to plan history.`)) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    fetch(`${API_BASE}/wellness/plan/${encodeURIComponent(uid)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((serverData) => {
        if (!serverData) return;
        applyServerState(serverData, { syncLocal: true });
        setShowPlanTransactions(false);
        setShowCreatePlanForm(false);
        setShowRenamePlanForm(false);
        setShowPlanMenu(false);
        setAssistantReply(`Plan closed and saved to history. Create a new plan to continue tracking.`);
      })
      .catch(() => setAssistantReply('Could not close the plan right now.'));
  }

  function handleLoadHistoryPlan(planId) {
    const uid = userIdRef.current;
    if (!uid || !planId) return;
    setHistoryPlan(null);
    fetch(`${API_BASE}/wellness/plan/${encodeURIComponent(uid)}/${encodeURIComponent(planId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setHistoryPlan(data); })
      .catch(() => {});
  }

  function handlePlanNameClick() {
    setShowPlanTransactions((current) => {
      const next = !current;
      if (next && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          transactionLogsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return next;
    });
  }

  /* ---- Strava connect / disconnect ---- */
  function handleStravaConnect() {
    const uid = userIdRef.current;
    if (!uid) return;
    setStravaLoading(true);
    const redirectUri = `${window.location.protocol}//${window.location.host}/wellness`;
    fetch(`${API_BASE}/wellness/strava/auth-url?userId=${encodeURIComponent(uid)}&redirectUri=${encodeURIComponent(redirectUri)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.url) window.location.href = d.url;
        else { setStravaMsg('Strava not configured on server (set STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET)'); setStravaLoading(false); }
      })
      .catch(() => { setStravaMsg('Server offline'); setStravaLoading(false); });
  }
  function handleStravaDisconnect() {
    const uid = userIdRef.current;
    if (!uid) return;
    fetch(`${API_BASE}/wellness/strava/${encodeURIComponent(uid)}`, { method: 'DELETE' })
      .then(() => { setStravaConnected(false); setStravaMsg('Strava disconnected'); })
      .catch(() => {});
  }
  function handleStravaSync() {
    const uid = userIdRef.current;
    if (!uid) return;
    setStravaLoading(true);
    setStravaMsg('');
    fetch(`${API_BASE}/wellness/strava/activities/${encodeURIComponent(uid)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        setStravaLoading(false);
        if (!d || !d.fields || Object.keys(d.fields).length === 0) {
          setStravaMsg('No Strava activities today');
          return;
        }
        setStravaMsg(`Synced ${d.activities} activities from Strava`);
        setForm((prev) => {
          const updated = { ...prev };
          for (const [key, val] of Object.entries(d.fields)) {
            updated[key] = val; // overwrite with Strava data
          }
          return updated;
        });
      })
      .catch(() => { setStravaLoading(false); setStravaMsg('Sync failed'); });
  }

  /* ---- persist (only after init, per-user keys) ---- */
  useEffect(() => {
    if (!initDoneRef.current || !userIdRef.current) return;
    if (suppressSyncCountRef.current > 0) {
      suppressSyncCountRef.current -= 1;
      return;
    }
    localStorage.setItem(storageKey(userIdRef.current, 'form'), JSON.stringify(form));
    syncToServer(entries, form);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!initDoneRef.current || !userIdRef.current) return;
    if (suppressSyncCountRef.current > 0) {
      suppressSyncCountRef.current -= 1;
      return;
    }
    localStorage.setItem(storageKey(userIdRef.current, 'entries'), JSON.stringify(entries));
    syncToServer(entries, form);
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initDoneRef.current) localStorage.setItem(STORAGE_LANG_KEY, voiceLanguage); }, [voiceLanguage]);

  /* ---- weather ---- */
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude, longitude } }) => {
      try {
        const [wRes, gRes] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`),
        ]);
        const wData = await wRes.json();
        const gData = await gRes.json();
        const code = wData.current?.weather_code ?? 0;
        setWeather({
          temp: Math.round(wData.current?.temperature_2m ?? 0),
          wind: Math.round(wData.current?.wind_speed_10m ?? 0),
          icon: weatherIcon(code), desc: weatherDesc(code),
          city: gData.address?.city || gData.address?.town || gData.address?.village || 'your area',
        });
      } catch (_) { /* ignore */ }
    }, () => { /* ignore */ });
  }, []);

  /* ---- date change → load that entry ---- */
  useEffect(() => {
    if (!initDoneRef.current) return;
    const existing = entries.find((e) => e.date === selectedDate);
    if (existing) {
      setForm(existing);
    } else {
      setForm({ ...DEFAULT_FORM, date: selectedDate });
    }
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- save ---- */
  function saveEntry(nextForm) {
    const entry = { ...nextForm, date: nextForm.date || selectedDate };
    setEntries((cur) => [entry, ...cur.filter((e) => e.date !== entry.date)]);
    setForm(entry);
    return entry;
  }

  /* ---- dropdown save ---- */
  function handleDropdownSave() {
    const actCfg = activityOptions.find((a) => a.id === selectedActivity);
    if (!actCfg) { setAssistantReply('Pick an activity first.'); return; }
    const next = { ...form, date: selectedDate };
    const updates = [];
    actCfg.fields.forEach((f) => {
      const val = Number(fieldValues[f.key] || 0);
      if (val > 0) {
        next[f.key] = (Number(next[f.key] || 0)) + val;
        updates.push({ key: f.key, label: f.label, unit: f.unit, value: next[f.key] });
      }
    });
    if (!updates.length) { setAssistantReply('Enter at least one value.'); return; }
    saveEntry(next);
    setAssistantReply(`Added: ${formatUpdateList(updates)}`);
    setFieldValues({});
  }

  /* ---- text parse ---- */
  function handleParsedMessage(message, source = 'text') {
    const trimmed = String(message || '').trim();
    if (!trimmed) return;
    const { nextForm, updates } = parseActivityCommand(form, trimmed);
    if (!updates.length) {
      setAssistantReply('Could not understand. Try again?');
      if (source === 'voice') setTranscript(trimmed);
      return;
    }
    saveEntry({ ...nextForm, date: selectedDate });
    setAssistantReply(summarizeAddedActivities(selectedDate, inferActivityNamesFromUpdates(updates), updates));
    setCommandInput('');
    if (source === 'voice') setTranscript(trimmed);
  }

  function toggleTracking() {
    setForm((cur) => ({ ...cur, trackingStartedAt: cur.trackingStartedAt ? null : new Date().toISOString(), date: selectedDate }));
  }

  /* ---- voice ---- */
  async function startVoiceInput() {
    if (typeof window === 'undefined') return;
    if (recognitionActiveRef.current || listening) { setVoiceStatus('Already listening'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceStatus('Needs Chrome / Edge'); return; }
    if (!window.isSecureContext && window.location.hostname !== 'localhost') { setVoiceStatus('Needs HTTPS'); return; }
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); } catch (_) { setVoiceStatus('Mic denied'); return; }

    if (!recognitionRef.current) {
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => { handleParsedMessage(e.results?.[0]?.[0]?.transcript || '', 'voice'); };
      rec.onstart = () => { recognitionActiveRef.current = true; setListening(true); setVoiceStatus('Listening...'); };
      rec.onend = () => { recognitionActiveRef.current = false; setListening(false); setVoiceStatus('Mic ready'); };
      rec.onerror = (e) => {
        recognitionActiveRef.current = false; setListening(false);
        if (e?.error === 'no-speech') { setAssistantReply('No speech heard.'); setVoiceStatus('No speech'); return; }
        if (e?.error === 'not-allowed') { setVoiceStatus('Mic blocked'); return; }
        setVoiceStatus('Mic error');
      };
      recognitionRef.current = rec;
    }
    recognitionRef.current.lang = voiceLanguage;
    recognitionActiveRef.current = true;
    try { recognitionRef.current.start(); } catch (err) {
      recognitionActiveRef.current = false;
      setVoiceStatus(err?.name === 'InvalidStateError' ? 'Already listening' : 'Mic error');
    }
  }

  /* ---- computed ---- */
  const stats = useMemo(() => computeDashboardStats(entries, form, scoringRules), [entries, form, scoringRules]);
  const todayScores = useMemo(() => computeEntryScores(form, scoringRules), [form, scoringRules]);
  const formHasScorableData = useMemo(() => hasScorableData(form), [form]);

  const recentRunning = useMemo(
    () => (entries.length ? entries : [form]).filter((e) => Number(e.runningDistanceKm || 0) > 0 || Number(e.runningMinutes || 0) > 0).slice(0, 5),
    [entries, form],
  );

  const recentWalking = useMemo(
    () => (entries.length ? entries : [form]).filter((e) => Number(e.walkingDistanceKm || 0) > 0 || Number(e.walkingMinutes || 0) > 0).slice(0, 5),
    [entries, form],
  );

  const activityOptions = useMemo(() => {
    const configuredFields = new Set(ACTIVITY_OPTIONS.flatMap((option) => option.fields.map((field) => field.key)));
    const dynamicOptions = (scoringRules?.activities || [])
      .filter((rule) => !configuredFields.has(rule.key))
      .map((rule) => ({
        id: `custom-${rule.key}`,
        label: rule.label || rule.key,
        icon: rule.icon || '✨',
        fields: [{ key: rule.key, label: rule.label || rule.key, unit: rule.unit || 'mins', step: 0.1 }],
      }));
    return [...ACTIVITY_OPTIONS, ...dynamicOptions];
  }, [scoringRules]);

  const selectedActivityConfig = activityOptions.find((a) => a.id === selectedActivity);
  const autoScoredDays = dailyScores.filter((score) => score.source === 'auto').length;
  const loggedPlanDays = dailyScores.filter((score) => score.source === 'entry').length;
  const latestPlanScore = dailyScores[0] || null;
  const totalPlanDays = dailyScores.length;
  const planTotals = useMemo(() => dailyScores.reduce((sum, score) => ({
    physical: sum.physical + Number(score.physicalScore || 0),
    mental: sum.mental + Number(score.mentalScore || 0),
    total: sum.total + Number(score.totalScore || 0),
  }), { physical: 0, mental: 0, total: 0 }), [dailyScores]);
  const planScoreChartData = useMemo(() => [...dailyScores].sort((left, right) => left.date.localeCompare(right.date)), [dailyScores]);
  const buddyLeaderboardMaxScore = useMemo(() => {
    const max = buddyPlanRows.reduce((best, row) => {
      const rowMax = (row.series || []).reduce((seriesBest, point) => Math.max(seriesBest, Number(point.cumulative || 0)), 0);
      return Math.max(best, rowMax, Number(row.cumulativeTotal || 0));
    }, 0);
    return Math.max(1, max);
  }, [buddyPlanRows]);
  const currentPenalty = scoringRules?.dailyPenalty || DAILY_PENALTY;
  const canManageScoringRules = isAdminUser(user);
  const hasActivePlan = Boolean(planInfo?.startDate && totalPlanDays > 0);
  const hasAnyActiveData = hasActivePlan || entries.some((entry) => hasScorableData(entry)) || formHasScorableData;
  const selectedDateIsToday = selectedDate === todayDate();
  const selectedDateCardLabel = selectedDateIsToday ? 'Today' : formatDisplayDate(selectedDate);
  const displayScores = !hasAnyActiveData
    ? { physical: 0, mental: 0, total: 0 }
    : hasActivePlan
      ? planTotals
      : { physical: stats.totalPhysicalScore, mental: stats.totalMentalScore, total: stats.totalBodyScore };
  const displayedPhysicalScore = displayScores.physical;
  const displayedMentalScore = displayScores.mental;
  const displayedTotalScore = displayScores.total;
  const visibleTodayScores = formHasScorableData ? todayScores : ZERO_SCORES;
  const readinessCards = [
    { label: 'Hampta Pass', targetScore: Number(scoringRules?.targets?.hamptaPass || stats.readiness.hamptaPass.targetScore), color: '#fb7185' },
    { label: 'Skiing Feb 2027', targetScore: Number(scoringRules?.targets?.skiing2027 || stats.readiness.skiing2027.targetScore), color: '#38bdf8' },
    { label: 'Marathon 10km', targetScore: Number(scoringRules?.targets?.marathon10k || stats.readiness.marathon10k.targetScore), color: '#f59e0b' },
  ].map((card) => {
    const currentScore = displayedTotalScore;
    const percent = Math.max(0, Math.min(100, Number(((currentScore / card.targetScore) * 100).toFixed(2))));
    return {
      ...card,
      currentScore: Number(currentScore.toFixed(2)),
      percent,
      remaining: Number(Math.max(0, card.targetScore - currentScore).toFixed(2)),
    };
  });

  /* ---- chart data ---- */
  const weekChartData = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const entry = (dateStr === form.date) ? form : entries.find((e) => e.date === dateStr);
      const scores = entry && hasScorableData(entry) ? computeEntryScores(entry, scoringRules) : ZERO_SCORES;
      days.push({ date: dateStr, dayLabel: d.toLocaleDateString('en', { weekday: 'short' }), ...scores });
    }
    return days;
  }, [entries, form, scoringRules]);

  const activityBreakdown = useMemo(() => {
    const week = [form, ...entries.filter((e) => e.date !== form.date)].slice(0, 7);
    const totals = [
      { label: 'Running', icon: '🏃', mins: week.reduce((s, e) => s + Number(e.runningMinutes || 0), 0), color: '#fb7185' },
      { label: 'Cycling', icon: '🚴', mins: week.reduce((s, e) => s + Number(e.cyclingMinutes || 0), 0), color: '#38bdf8' },
      { label: 'Walking', icon: '🚶', mins: week.reduce((s, e) => s + Number(e.walkingMinutes || 0), 0), color: '#a3e635' },
      { label: 'Workout', icon: '💪', mins: week.reduce((s, e) => s + Number(e.exerciseMinutes || 0), 0), color: '#f59e0b' },
      { label: 'Yoga', icon: '🧘', mins: week.reduce((s, e) => s + Number(e.yogaMinutes || 0), 0), color: '#fbbf24' },
      { label: 'Badminton', icon: '🏸', mins: week.reduce((s, e) => s + Number(e.badmintonMinutes || 0), 0), color: '#eab308' },
      { label: 'Football', icon: '⚽', mins: week.reduce((s, e) => s + Number(e.footballMinutes || 0), 0), color: '#22c55e' },
      { label: 'Cricket', icon: '🏏', mins: week.reduce((s, e) => s + Number(e.cricketMinutes || 0), 0), color: '#8b5cf6' },
      { label: 'Swimming', icon: '🏊', mins: week.reduce((s, e) => s + Number(e.swimmingMinutes || 0), 0), color: '#0ea5e9' },
      { label: 'Meditation', icon: '🧘', mins: week.reduce((s, e) => s + Number(e.meditationMinutes || 0), 0), color: '#38bdf8' },
    ].filter((a) => a.mins > 0);
    const totalMins = totals.reduce((s, a) => s + a.mins, 0);
    return { activities: totals, totalMins };
  }, [entries, form]);

  const todayActivities = useMemo(() => {
    const list = [];
    if (Number(form.runningDistanceKm || 0) > 0 || Number(form.runningMinutes || 0) > 0) list.push({ icon: '🏃', label: 'Running', detail: `${formatMetric(form.runningDistanceKm)} km · ${formatMetric(form.runningMinutes)} mins` });
    if (Number(form.cyclingDistanceKm || 0) > 0 || Number(form.cyclingMinutes || 0) > 0) list.push({ icon: '🚴', label: 'Cycling', detail: `${formatMetric(form.cyclingDistanceKm)} km · ${formatMetric(form.cyclingMinutes)} mins` });
    if (Number(form.walkingDistanceKm || 0) > 0 || Number(form.walkingMinutes || 0) > 0) list.push({ icon: '🚶', label: 'Walking', detail: `${formatMetric(form.walkingDistanceKm)} km · ${formatMetric(form.walkingMinutes)} mins` });
    if (Number(form.exerciseMinutes || 0) > 0) list.push({ icon: '💪', label: 'Workout', detail: `${formatMetric(form.exerciseMinutes)} mins` });
      if (Number(form.yogaMinutes || 0) > 0) list.push({ icon: '🧘', label: 'Yoga', detail: `${formatMetric(form.yogaMinutes)} mins` });
    if (Number(form.badmintonMinutes || 0) > 0) list.push({ icon: '🏸', label: 'Badminton', detail: `${formatMetric(form.badmintonMinutes)} mins` });
    if (Number(form.footballMinutes || 0) > 0) list.push({ icon: '⚽', label: 'Football', detail: `${formatMetric(form.footballMinutes)} mins` });
    if (Number(form.cricketMinutes || 0) > 0) list.push({ icon: '🏏', label: 'Cricket', detail: `${formatMetric(form.cricketMinutes)} mins` });
    if (Number(form.swimmingMinutes || 0) > 0) list.push({ icon: '🏊', label: 'Swimming', detail: `${formatMetric(form.swimmingMinutes)} mins` });
    if (Number(form.meditationMinutes || 0) > 0) list.push({ icon: '🧘', label: 'Meditation', detail: `${formatMetric(form.meditationMinutes)} mins` });
    if (Number(form.whiskyPegs || 0) > 0) list.push({ icon: '🥃', label: 'Whisky', detail: `${formatMetric(form.whiskyPegs)} pegs` });
    if (Number(form.fastFoodServings || 0) > 0) list.push({ icon: '🍔', label: 'Fast food', detail: `${formatMetric(form.fastFoodServings)} count` });
    if (Number(form.sugarServings || 0) > 0) list.push({ icon: '🍬', label: 'Sugar', detail: `${formatMetric(form.sugarServings)} count` });
    if (Number(form.sleepHours || 0) > 0) list.push({ icon: '😴', label: 'Sleep', detail: `${formatMetric(form.sleepHours)} hrs` });
    return list;
  }, [form]);

  /* ---- loading ---- */
  if (!user || loading) {
    return (
      <div style={s.loadingPage}>
        <style>{pageKeyframes}</style>
        <MountainBg />
        <div style={s.loadingCard}>
          <div style={s.loadingOrb} />
          <div style={s.loadingTitle}>Loading Henna...</div>
        </div>
      </div>
    );
  }

  /* ======== RENDER ======== */
  return (
    <>
      <style>{pageKeyframes}</style>
      <MountainBg />
      <div style={s.page} className="henna-page">
        {/* header */}
        <div style={s.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.eyebrow}>Wellness Tracker</div>
            <h1 style={s.title}>Henna</h1>
          </div>
          <div style={s.headerRight}>
            {weather && (
              <div style={s.weatherPill}>
                <span>{weather.icon}</span>
                <span style={{ fontWeight: 800 }}>{weather.temp}°C</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{weather.city}</span>
              </div>
            )}
            {canManageScoringRules && <button onClick={() => router.push('/wellness-admin')} style={s.chipBtn}>Scoring Admin</button>}
            <button onClick={() => router.push('/dashboard')} style={s.chipBtn}>Dashboard</button>
          </div>
        </div>

        {/* scores on top */}
        {planInfo && <div style={s.scoreStrip} className="score-strip">
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>🏋️</div>
            <div>
              <div style={s.scoreLabel}>Physical</div>
              <div style={s.scoreNum}>{formatMetric(displayedPhysicalScore)}</div>
            </div>
          </div>
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>🧠</div>
            <div>
              <div style={s.scoreLabel}>Mental</div>
              <div style={s.scoreNum}>{formatMetric(displayedMentalScore)}</div>
            </div>
          </div>
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>⚡</div>
            <div>
              <div style={s.scoreLabel}>Total</div>
              <div style={s.scoreNum}>{formatMetric(displayedTotalScore)}</div>
            </div>
          </div>
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>📅</div>
            <div>
              <div style={s.scoreLabel}>{selectedDateCardLabel}</div>
              <div style={s.scoreNum}>{formatMetric(visibleTodayScores.totalScore)}</div>
            </div>
          </div>
        </div>}

        {/* weekly summary bar */}
        {planInfo && <div style={s.weeklySummary} className="score-strip">
          <div style={s.weeklyItem}>
            <span style={s.weeklyIcon}>🔥</span>
            <span style={s.weeklyLabel}>Active days</span>
            <span style={s.weeklyVal}>{stats.activeDays}<span style={{ opacity: 0.5, fontWeight: 400 }}>/7</span></span>
          </div>
          <div style={s.weeklyItem}>
            <span style={s.weeklyIcon}>⏱️</span>
            <span style={s.weeklyLabel}>Weekly mins</span>
            <span style={s.weeklyVal}>{formatMetric(stats.weeklyWorkoutMinutes)}</span>
          </div>
          <div style={s.weeklyItem}>
            <span style={s.weeklyIcon}>🏃</span>
            <span style={s.weeklyLabel}>Weekly km</span>
            <span style={s.weeklyVal}>{formatMetric(stats.weeklyRunningKm)}</span>
          </div>
          <div style={s.weeklyItem}>
            <span style={s.weeklyIcon}>📈</span>
            <span style={s.weeklyLabel}>Avg pace</span>
            <span style={s.weeklyVal}>{stats.averagePace == null ? '--' : `${formatMetric(stats.averagePace)}`}<span style={{ opacity: 0.5, fontWeight: 400, fontSize: 11 }}>{stats.averagePace != null ? ' min/km' : ''}</span></span>
          </div>
        </div>}

        {/* main grid */}
        <div style={s.mainGrid} className="main-grid">
          {/* left: add activity */}
          <div style={s.card}>
            <div style={s.cardHead}>
              <span style={s.cardTitle}>Add Activity</span>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={s.dateInput} max={todayDate()} />
            </div>

            <div style={s.planCard}>
              <div style={s.planHeaderRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.planTitle}>{planInfo ? 'Active Plan' : 'Wellness Plan'}</div>
                  {planInfo?.name && (
                    <button
                      type="button"
                      onClick={handlePlanNameClick}
                      onDoubleClick={() => { setPlanNameDraft(planInfo.name); setShowRenamePlanForm(true); setShowPlanMenu(false); }}
                      style={s.planNameBtn}
                      title="Double-click to rename"
                    >{planInfo.name}</button>
                  )}
                  <div style={s.planCopy}>
                    {planInfo?.startDate
                      ? `Active since ${formatDisplayDate(planInfo.startDate)} · ${totalPlanDays} day${totalPlanDays === 1 ? '' : 's'} · ${loggedPlanDays} logged`
                      : 'No active plan. Pick a start date below to begin tracking.'}
                  </div>
                </div>
                {planInfo?.id && (
                  <div style={s.planMenuWrap}>
                    <button type="button" onClick={() => setShowPlanMenu((c) => !c)} style={s.planIconBtn} aria-label="Open plan actions">⋯</button>
                    {showPlanMenu && (
                      <div style={s.planMenu}>
                        <button type="button" onClick={() => { handleClosePlan(); setShowPlanMenu(false); }} style={{ ...s.planMenuItem, color: '#fde68a' }}>Close plan</button>
                        <button type="button" onClick={handleResetCurrentPlan} style={{ ...s.planMenuItem, color: '#fecaca' }}>Reset plan data</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {showRenamePlanForm && planInfo?.id && (
                <div style={s.planControls}>
                  <input type="text" value={planNameDraft} onChange={(e) => setPlanNameDraft(e.target.value)} placeholder="New plan name" style={s.planTextInput} />
                  <button onClick={handleRenamePlan} style={s.planBtn}>Save</button>
                  <button type="button" onClick={() => setShowRenamePlanForm(false)} style={{ ...s.planBtn, background: 'rgba(255,255,255,0.12)' }}>Cancel</button>
                </div>
              )}
              {!planInfo && (
                <div style={s.planControls}>
                  <input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} style={s.dateInput} max={todayDate()} />
                  <input type="text" value={planNameDraft} onChange={(e) => setPlanNameDraft(e.target.value)} placeholder="Plan name (optional)" style={s.planTextInput} />
                  <button onClick={handleStartPlan} style={s.planBtn}>Start Plan</button>
                </div>
              )}
              {planInfo && (
                <div style={s.planStatsGrid} className="plan-stats-grid">
                  <div style={s.planStatCard}><span style={s.planStatLabel}>Plan days</span><span style={s.planStatValue}>{totalPlanDays}</span></div>
                  <div style={s.planStatCard}><span style={s.planStatLabel}>Physical</span><span style={s.planStatValue}>{formatMetric(planTotals.physical)}</span></div>
                  <div style={s.planStatCard}><span style={s.planStatLabel}>Mental</span><span style={s.planStatValue}>{formatMetric(planTotals.mental)}</span></div>
                  <div style={s.planStatCard}><span style={s.planStatLabel}>Total</span><span style={{ ...s.planStatValue, color: planTotals.total >= 0 ? '#4ade80' : '#f87171' }}>{formatMetric(planTotals.total)}</span></div>
                </div>
              )}
              {planInfo && latestPlanScore && (
                <div style={s.planMeta}>
                  Latest: {formatMetric(latestPlanScore.totalScore)} pts on {formatDisplayDate(latestPlanScore.date)} · Cumulative: {formatMetric(latestPlanScore.cumulativeTotalScore || 0)} pts · Double-click plan name to rename.
                </div>
              )}
            </div>

            {planInfo ? (<>
            <div style={s.toggleRow}>
              <button onClick={() => setInputMode('dropdown')} style={inputMode === 'dropdown' ? s.toggleActive : s.toggleBtn}>Dropdown</button>
              <button onClick={() => setInputMode('text')} style={inputMode === 'text' ? s.toggleActive : s.toggleBtn}>Text / Voice</button>
            </div>
            {inputMode === 'dropdown' ? (
              <>
                <div style={s.activityGrid} className="activity-grid">
                  {activityOptions.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setSelectedActivity(a.id); setFieldValues({}); }}
                      style={selectedActivity === a.id ? s.actBtnActive : s.actBtn}
                    >
                      <span style={{ fontSize: 20 }}>{a.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{a.label}</span>
                    </button>
                  ))}
                </div>

                {selectedActivityConfig && (
                  <div style={s.fieldRow} className="field-row">
                    {selectedActivityConfig.fields.map((f) => (
                      <div key={f.key} style={s.fieldGroup}>
                        <label style={s.fieldLabel}>{f.label} ({f.unit})</label>
                        <input
                          type="number"
                          min="0"
                          step={f.step}
                          value={fieldValues[f.key] || ''}
                          onChange={(e) => setFieldValues((cur) => ({ ...cur, [f.key]: e.target.value }))}
                          placeholder="0"
                          style={s.fieldInput}
                        />
                      </div>
                    ))}
                    <button onClick={handleDropdownSave} style={s.addBtn}>+ Add</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={s.textRow}>
                  <input
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleParsedMessage(commandInput, 'text'); }}
                    placeholder="e.g. running 5 km 30 min"
                    style={s.textInput}
                  />
                  <button onClick={() => handleParsedMessage(commandInput, 'text')} style={s.addBtn}>Add</button>
                </div>
                <div style={s.voiceRow}>
                  <button onClick={startVoiceInput} style={listening ? s.micActive : s.micBtn}>
                    {listening ? '🔴 Listening...' : '🎙️ Voice'}
                  </button>
                  <select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)} style={s.langSelect}>
                    {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{voiceStatus}</span>
                </div>
                {showMicSecurityWarning && <div style={s.warnText}>Mic needs HTTPS or localhost.</div>}
                {transcript && <div style={s.metaText}>Heard: {transcript}</div>}
              </div>
            )}

            {assistantReply && <div style={s.replyBubble}>{assistantReply}</div>}
            <div style={s.warnText}>⚠️ Daily drain: -{DAILY_PENALTY.physical} physical (body decay), -{DAILY_PENALTY.mental} mental (office/life)</div>

            {/* Strava integration */}
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(252,82,0,0.12)', borderRadius: 10, border: '1px solid rgba(252,82,0,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>🏃</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#fc5200' }}>Strava</span>
                {stravaConnected ? (
                  <>
                    <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>● Connected</span>
                    <button onClick={handleStravaSync} disabled={stravaLoading} style={{ ...s.chipBtn, fontSize: 11, padding: '4px 10px', background: 'rgba(252,82,0,0.2)', color: '#fc5200', border: '1px solid rgba(252,82,0,0.3)' }}>
                      {stravaLoading ? '...' : '🔄 Sync now'}
                    </button>
                    <button onClick={handleStravaDisconnect} style={{ ...s.chipBtn, fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button onClick={handleStravaConnect} disabled={stravaLoading} style={{ ...s.chipBtn, fontSize: 11, padding: '4px 12px', background: 'rgba(252,82,0,0.25)', color: '#fff', border: '1px solid rgba(252,82,0,0.4)', fontWeight: 700 }}>
                    {stravaLoading ? 'Connecting...' : 'Connect Strava'}
                  </button>
                )}
              </div>
              {stravaMsg && <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85, color: '#fbbf24' }}>{stravaMsg}</div>}
              {!stravaConnected && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>Auto-import running, walking & workouts from Strava</div>}
            </div>

            {todayActivities.length > 0 && (
              <div style={s.loggedSection}>
                <div style={s.loggedTitle}>Logged on {selectedDate}</div>
                <div style={s.loggedList}>
                  {todayActivities.map((a) => (
                    <div key={a.label} style={s.loggedItem}>
                      <span>{a.icon}</span>
                      <span style={{ fontWeight: 700 }}>{a.label}</span>
                      <span style={{ opacity: 0.8, fontSize: 13 }}>{a.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>) : (
              <div style={s.noPlanMsg}>☝️ Create the plan above to start logging your daily activities.</div>
            )}
          </div>

          {/* right: readiness targets */}
          {planInfo && <div style={s.card}>
            <div style={s.cardTitle}>Readiness Targets</div>
            {readinessCards.map((t) => (
              <div key={t.label} style={s.targetCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</span>
                  <span style={{ fontSize: 13, opacity: 0.8 }}>{formatMetric(t.currentScore)} / {t.targetScore}</span>
                </div>
                <div style={s.progressTrack}>
                  <div style={{ ...s.progressBar, width: `${Math.min(100, t.percent)}%`, background: t.color }} />
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{formatMetric(t.percent)}% — {formatMetric(t.remaining)} pts remaining</div>
              </div>
            ))}

            <div style={{ ...s.cardTitle, marginTop: 20 }}>{selectedDateIsToday ? 'Today\'s Breakdown' : `${formatDisplayDate(selectedDate)} Breakdown`}</div>
            <div style={s.breakdownGrid}>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Physical</span><span style={{ fontWeight: 800 }}>{formatMetric(visibleTodayScores.physicalScore)}</span></div>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Mental</span><span style={{ fontWeight: 800 }}>{formatMetric(visibleTodayScores.mentalScore)}</span></div>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Workout mins</span><span style={{ fontWeight: 800 }}>{formatMetric(visibleTodayScores.workoutMinutes)}</span></div>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Sleep effect</span><span style={{ fontWeight: 800, color: visibleTodayScores.sleepPhysical > 0 ? '#4ade80' : visibleTodayScores.sleepPhysical < 0 ? '#f87171' : '#94a3b8' }}>{visibleTodayScores.sleepPhysical > 0 ? '+' : ''}{formatMetric(visibleTodayScores.sleepPhysical)}</span></div>
            </div>
          </div>}
        </div>

        {planInfo && (<>
        {/* ---- Charts Section ---- */}
        <div style={s.dashSection}>
          <div style={s.dashGrid} className="dash-grid">
            {/* Weekly Score Bar Chart */}
            <div style={s.card}>
              <div style={s.cardTitle}>📈 Daily Total Score</div>
              <div style={s.metaText}>This line shows each day's total score directly, not the running total.</div>
              <div style={s.chartWrap}>
                {(() => {
                  const chartW = 320;
                  const chartH = 160;
                  const minScore = Math.min(0, ...weekChartData.map((d) => d.totalScore));
                  const maxScore = Math.max(0, ...weekChartData.map((d) => d.totalScore));
                  const scoreRange = Math.max(1, maxScore - minScore);
                  const zeroY = chartH - (((0 - minScore) / scoreRange) * (chartH - 24)) - 12;
                  const totalPoints = weekChartData.map((d, i) => {
                    const x = weekChartData.length === 1 ? chartW / 2 : (i / (weekChartData.length - 1)) * chartW;
                    const y = chartH - (((d.totalScore - minScore) / scoreRange) * (chartH - 24)) - 12;
                    return `${x},${y}`;
                  }).join(' ');
                  return (
                    <svg viewBox={`0 0 ${chartW} ${chartH + 28}`} style={{ width: '100%', height: chartH + 28 }}>
                      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                        const y = chartH - (f * (chartH - 24)) - 12;
                        return (
                          <line key={f} x1="0" x2={chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                        );
                      })}
                      <polyline fill="none" stroke="#fde68a" strokeWidth="3" points={totalPoints} />
                      {weekChartData.map((d, i) => {
                        const x = weekChartData.length === 1 ? chartW / 2 : (i / (weekChartData.length - 1)) * chartW;
                        const y = chartH - (((d.totalScore - minScore) / scoreRange) * (chartH - 24)) - 12;
                        const isToday = d.date === todayDate();
                        return (
                          <g key={d.date}>
                            <circle cx={x} cy={y} r="4.5" fill={d.totalScore < 0 ? '#f87171' : isToday ? '#fde68a' : '#fbbf24'} />
                            <text x={x} y={y - 8} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" opacity="0.9">
                              {d.totalScore !== 0 ? formatMetric(d.totalScore) : ''}
                            </text>
                            <text x={x} y={chartH + 18} textAnchor="middle" fill="#fff" fontSize="10" fontWeight={isToday ? '800' : '500'} opacity={isToday ? 1 : 0.55}>
                              {d.dayLabel}
                            </text>
                          </g>
                        );
                      })}
                      <line x1="0" x2={chartW} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4" />
                      <text x="8" y="18" fill="#fde68a" fontSize="11" fontWeight="700">Total score per day</text>
                    </svg>
                  );
                })()}
              </div>
              {/* Physical vs Mental mini bars */}
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 600, marginBottom: 4 }}>Physical (7 days)</div>
                  <div style={s.progressTrack}>
                    <div style={{ ...s.progressBar, width: `${Math.min(100, Math.max(2, (stats.totalPhysicalScore / Math.max(1, stats.totalBodyScore)) * 100))}%`, background: '#fb7185' }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 600, marginBottom: 4 }}>Mental (7 days)</div>
                  <div style={s.progressTrack}>
                    <div style={{ ...s.progressBar, width: `${Math.min(100, Math.max(2, (stats.totalMentalScore / Math.max(1, stats.totalBodyScore)) * 100))}%`, background: '#38bdf8' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Activity Breakdown Donut */}
            <div style={s.card}>
              <div style={s.cardTitle}>🎯 Activity Breakdown <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.6 }}>(7 days)</span></div>
              {activityBreakdown.activities.length > 0 ? (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 8 }}>
                  {/* Donut Chart */}
                  <div style={{ flexShrink: 0 }}>
                    <svg viewBox="0 0 120 120" style={{ width: 120, height: 120 }}>
                      {(() => {
                        const cx = 60, cy = 60, r = 46, circumference = 2 * Math.PI * r;
                        let offset = 0;
                        return activityBreakdown.activities.map((a) => {
                          const pct = a.mins / activityBreakdown.totalMins;
                          const dashLen = pct * circumference;
                          const gap = circumference - dashLen;
                          const el = (
                            <circle key={a.label} cx={cx} cy={cy} r={r}
                              fill="none" stroke={a.color} strokeWidth="14"
                              strokeDasharray={`${dashLen} ${gap}`}
                              strokeDashoffset={-offset}
                              strokeLinecap="round"
                              transform={`rotate(-90 ${cx} ${cy})`}
                              style={{ transition: 'stroke-dasharray .4s' }}
                            />
                          );
                          offset += dashLen;
                          return el;
                        });
                      })()}
                      <text x="60" y="56" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900">{activityBreakdown.totalMins}</text>
                      <text x="60" y="72" textAnchor="middle" fill="#fff" fontSize="10" opacity="0.6">mins</text>
                    </svg>
                  </div>
                  {/* Legend */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activityBreakdown.activities.map((a) => (
                      <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, opacity: 0.85 }}>{a.icon} {a.label}</span>
                        <span style={{ fontWeight: 700 }}>{a.mins}<span style={{ opacity: 0.5, fontWeight: 400 }}> min</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={s.metaText}>No activities logged this week yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* running + walking dashboards */}
        <div style={s.dashSection}>
          <div style={s.dashGrid} className="dash-grid">
            <div style={s.card}>
              <div style={s.cardTitle}>🏃 Running</div>
              <div style={s.statRow}>
                <div style={s.statBox}><div style={s.statLabel}>Weekly km</div><div style={s.statVal}>{formatMetric(stats.weeklyRunningKm)}</div></div>
                <div style={s.statBox}><div style={s.statLabel}>Avg pace</div><div style={s.statVal}>{stats.averagePace == null ? '--' : `${formatMetric(stats.averagePace)} min/km`}</div></div>
                <div style={s.statBox}><div style={s.statLabel}>Workout mins</div><div style={s.statVal}>{formatMetric(stats.weeklyWorkoutMinutes)}</div></div>
              </div>
              <div style={s.loggedTitle}>Recent runs</div>
              {recentRunning.length ? recentRunning.map((e) => (
                <div key={e.date} style={s.logRow}>
                  <span>{e.date}</span><span>{formatMetric(e.runningDistanceKm)} km</span><span>{formatMetric(e.runningMinutes)} min</span>
                </div>
              )) : <div style={s.metaText}>No runs yet.</div>}
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>🚶 Walking</div>
              <div style={s.statRow}>
                <div style={s.statBox}>
                  <div style={s.statLabel}>Weekly km</div>
                  <div style={s.statVal}>{formatMetric(entries.slice(0, 7).reduce((sum, e) => sum + Number(e.walkingDistanceKm || 0), 0))}</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statLabel}>Weekly mins</div>
                  <div style={s.statVal}>{formatMetric(entries.slice(0, 7).reduce((sum, e) => sum + Number(e.walkingMinutes || 0), 0))}</div>
                </div>
              </div>
              <div style={s.loggedTitle}>Recent walks</div>
              {recentWalking.length ? recentWalking.map((e) => (
                <div key={e.date} style={s.logRow}>
                  <span>{e.date}</span><span>{formatMetric(e.walkingDistanceKm)} km</span><span>{formatMetric(e.walkingMinutes)} min</span>
                </div>
              )) : <div style={s.metaText}>No walks yet.</div>}
            </div>
          </div>
        </div>
        </>)}

        {planScoreChartData.length > 0 && (
          <div style={{ ...s.card, marginTop: 14 }}>
            <div style={s.cardTitle}>Plan Score Trends</div>
            <div style={s.metaText}>Daily total score and cumulative total score for the active plan, recalculated from the current scoring rules.</div>
            <div style={s.chartWrap}>
              {(() => {
                const minScore = Math.min(
                  ...planScoreChartData.map((point) => Math.min(point.totalScore, point.cumulativeTotalScore || 0)),
                  0,
                );
                const maxScore = Math.max(
                  ...planScoreChartData.map((point) => Math.max(point.totalScore, point.cumulativeTotalScore || 0)),
                  1,
                );
                const chartWidth = 640;
                const chartHeight = 220;
                const normalizedRange = Math.max(1, maxScore - minScore);
                const dailyPoints = planScoreChartData.map((point, index) => {
                  const x = planScoreChartData.length === 1 ? chartWidth / 2 : (index / (planScoreChartData.length - 1)) * chartWidth;
                  const y = chartHeight - (((point.totalScore - minScore) / normalizedRange) * (chartHeight - 24)) - 12;
                  return `${x},${y}`;
                }).join(' ');
                const cumulativePoints = planScoreChartData.map((point, index) => {
                  const x = planScoreChartData.length === 1 ? chartWidth / 2 : (index / (planScoreChartData.length - 1)) * chartWidth;
                  const y = chartHeight - ((((point.cumulativeTotalScore || 0) - minScore) / normalizedRange) * (chartHeight - 24)) - 12;
                  return `${x},${y}`;
                }).join(' ');
                const zeroY = chartHeight - (((0 - minScore) / normalizedRange) * (chartHeight - 24)) - 12;
                return (
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 26}`} style={{ width: '100%', height: chartHeight + 26 }}>
                    <line x1="0" x2={chartWidth} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.16)" strokeWidth="1" strokeDasharray="4" />
                    <polyline fill="none" stroke="#fde68a" strokeWidth="2.5" strokeDasharray="6 5" points={dailyPoints} />
                    <polyline fill="none" stroke="#4ade80" strokeWidth="3.5" points={cumulativePoints} />
                    {planScoreChartData.map((point, index) => {
                      const x = planScoreChartData.length === 1 ? chartWidth / 2 : (index / (planScoreChartData.length - 1)) * chartWidth;
                      const dailyY = chartHeight - (((point.totalScore - minScore) / normalizedRange) * (chartHeight - 24)) - 12;
                      const cumulativeY = chartHeight - ((((point.cumulativeTotalScore || 0) - minScore) / normalizedRange) * (chartHeight - 24)) - 12;
                      const showLabel = index === 0 || index === planScoreChartData.length - 1 || index % Math.max(1, Math.ceil(planScoreChartData.length / 6)) === 0;
                      return (
                        <g key={point.date}>
                          <circle cx={x} cy={dailyY} r="4" fill={point.source === 'auto' ? '#f59e0b' : '#fde68a'} />
                          <circle cx={x} cy={cumulativeY} r="4.5" fill="#4ade80" />
                          {showLabel && <text x={x} y={chartHeight + 16} textAnchor="middle" fill="#fff" fontSize="10" opacity="0.7">{point.date.slice(5)}</text>}
                          <text x={x} y={cumulativeY - 8} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" opacity="0.85">{formatMetric(point.cumulativeTotalScore || 0)}</text>
                        </g>
                      );
                    })}
                    <text x="12" y="18" fill="#4ade80" fontSize="11" fontWeight="700">Cumulative total</text>
                    <text x="122" y="18" fill="#fde68a" fontSize="11" fontWeight="700">Daily total</text>
                  </svg>
                );
              })()}
            </div>
          </div>
        )}

        <div style={{ ...s.card, marginTop: 14 }}>
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>Current Plan Leaderboard</div>
              <div style={s.metaText}>Shows only active running plans for you and your buddies, with cumulative score trend.</div>
            </div>
          </div>
          {buddyPlanLoading ? (
            <div style={s.metaText}>Loading buddy leaderboard...</div>
          ) : buddyPlanRows.length === 0 ? (
            <div style={s.metaText}>No active running plans found for you and your buddies yet.</div>
          ) : (
            <div style={s.buddyLeaderboardWrap}>
              <div style={s.buddyLeaderboardHead}>
                <span>#</span>
                <span>Buddy</span>
                <span style={{ textAlign: 'right' }}>Cumulative</span>
                <span style={{ textAlign: 'right' }}>Trend</span>
              </div>
              {buddyPlanRows.map((row, index) => {
                const rank = index + 1;
                const graphWidth = 156;
                const graphHeight = 38;
                const points = (row.series || []).map((point, pointIndex) => {
                  const x = (row.series.length <= 1)
                    ? graphWidth / 2
                    : (pointIndex / (row.series.length - 1)) * graphWidth;
                  const y = graphHeight - ((Number(point.cumulative || 0) / buddyLeaderboardMaxScore) * (graphHeight - 6)) - 3;
                  return `${x},${y}`;
                }).join(' ');
                const rankColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#fda4af' : '#bfdbfe';
                return (
                  <div key={row.id} style={s.buddyLeaderboardRow}>
                    <span style={{ ...s.buddyRank, color: rankColor }}>{rank}</span>
                    <div style={s.buddyIdentityCol}>
                      <div style={s.buddyNameLine}>
                        <span style={s.buddyName}>{row.name}</span>
                        {row.isSelf && <span style={s.buddySelfBadge}>You</span>}
                      </div>
                      <div style={s.buddyMetaLine}>
                        {row.planName} · {row.days}d · Last {formatMetric(row.lastDayScore)}
                      </div>
                    </div>
                    <span style={s.buddyScore}>{formatMetric(row.cumulativeTotal)}</span>
                    <div style={s.buddyTrendWrap}>
                      {row.series.length > 0 ? (
                        <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} style={{ width: graphWidth, height: graphHeight }}>
                          <polyline fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" points={`0,${graphHeight - 3} ${graphWidth},${graphHeight - 3}`} />
                          <polyline fill="none" stroke={row.isSelf ? '#22c55e' : '#60a5fa'} strokeWidth="2.2" points={points} />
                        </svg>
                      ) : (
                        <span style={s.metaText}>No score data</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ ...s.card, marginTop: 14 }} ref={transactionLogsRef}>
          <button type="button" onClick={() => setShowPlanTransactions((current) => !current)} style={s.sectionToggleBtn}>
            <span>Transaction Logs {planInfo?.name ? `- ${planInfo.name}` : ''}</span>
            <span>{showPlanTransactions ? 'Hide' : 'Show'}</span>
          </button>
          {showPlanTransactions && (
            <div style={s.sectionContent}>
              {planTransactions.length > 0 ? (
                <div style={s.planTimeline}>
                  {planTransactions.map((transaction, index) => {
                    const isDrain = transaction.source === 'daily-drain';
                    const isSleep = transaction.activityName === 'Sleep';
                    const rowStyle = isDrain
                      ? { ...s.planTimelineRow, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }
                      : isSleep
                        ? { ...s.planTimelineRow, background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.22)' }
                        : s.planTimelineRow;
                    const nameStyle = isDrain
                      ? { ...s.planTimelineName, color: '#fca5a5' }
                      : isSleep
                        ? { ...s.planTimelineName, color: '#93c5fd' }
                        : s.planTimelineName;
                    const icon = isDrain ? '📉' : isSleep ? '😴' : '🏃';
                    return (
                      <div key={`${transaction.date}-${transaction.activityName}-${index}`} style={rowStyle}>
                        <div style={s.planTimelineDate}>{formatDisplayDate(transaction.date)}</div>
                        <div style={s.planTimelineBody}>
                          <div style={nameStyle}>{icon} {transaction.activityName}</div>
                          <div style={s.planTimelineDetail}>{transaction.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={s.metaText}>Create a plan to see the transaction log.</div>
              )}
            </div>
          )}
        </div>

        {/* Plan History */}
        {allPlans.filter((p) => p.status === 'inactive').length > 0 && (
          <div style={{ ...s.card, marginTop: 14 }}>
            <button type="button" onClick={() => setShowPlanHistory((c) => !c)} style={s.sectionToggleBtn}>
              <span>📚 Plan History ({allPlans.filter((p) => p.status === 'inactive').length})</span>
              <span>{showPlanHistory ? 'Hide' : 'Show'}</span>
            </button>
            {showPlanHistory && (
              <div style={s.sectionContent}>
                <div style={{ display: 'grid', gap: 10 }}>
                  {allPlans.filter((p) => p.status === 'inactive').map((plan) => (
                    <div key={plan.id} style={s.historyPlanRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.historyPlanName}>{plan.name}</div>
                        <div style={s.historyPlanDates}>
                          {formatDisplayDate(plan.startDate)} → {plan.endedAt ? formatDisplayDate(plan.endedAt) : '—'}
                          {plan.finalTotals ? ` · ${plan.finalTotals.days} days` : ''}
                        </div>
                      </div>
                      {plan.finalTotals && (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>Phys</div>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{formatMetric(plan.finalTotals.physical)}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>Mental</div>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{formatMetric(plan.finalTotals.mental)}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>Total</div>
                            <div style={{ fontWeight: 900, fontSize: 18, color: plan.finalTotals.total >= 0 ? '#4ade80' : '#f87171' }}>{formatMetric(plan.finalTotals.total)}</div>
                          </div>
                        </div>
                      )}
                      <button type="button" onClick={() => handleLoadHistoryPlan(plan.id)} style={{ ...s.chipBtn, flexShrink: 0 }}>
                        {historyPlan?.plan?.id === plan.id ? 'Close ✕' : 'View →'}
                      </button>
                    </div>
                  ))}
                </div>

                {historyPlan && (
                  <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(255,255,255,0.06)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 17, color: '#fde68a' }}>{historyPlan.plan.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                          {formatDisplayDate(historyPlan.plan.startDate)} → {historyPlan.plan.endedAt ? formatDisplayDate(historyPlan.plan.endedAt) : '—'} · {historyPlan.dailyScores.length} days
                        </div>
                      </div>
                      <button type="button" onClick={() => setHistoryPlan(null)} style={{ ...s.chipBtn, fontSize: 11, flexShrink: 0 }}>✕ Close</button>
                    </div>

                    {historyPlan.dailyScores.length > 0 && (() => {
                      const chartData = historyPlan.dailyScores;
                      const minScore = Math.min(...chartData.map((d) => Math.min(d.totalScore, d.cumulativeTotalScore || 0)), 0);
                      const maxScore = Math.max(...chartData.map((d) => Math.max(d.totalScore, d.cumulativeTotalScore || 0)), 1);
                      const chartW = 580;
                      const chartH = 160;
                      const range = Math.max(1, maxScore - minScore);
                      const px = (i) => (chartData.length === 1 ? chartW / 2 : (i / (chartData.length - 1)) * chartW);
                      const py = (score) => chartH - (((score - minScore) / range) * (chartH - 24)) - 12;
                      const cumPts = chartData.map((d, i) => `${px(i)},${py(d.cumulativeTotalScore || 0)}`).join(' ');
                      const dayPts = chartData.map((d, i) => `${px(i)},${py(d.totalScore)}`).join(' ');
                      const zeroY = py(0);
                      return (
                        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                          <svg viewBox={`0 0 ${chartW} ${chartH + 26}`} style={{ width: '100%', height: chartH + 26, minWidth: 280 }}>
                            <line x1="0" x2={chartW} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4" />
                            <polyline fill="none" stroke="#fde68a" strokeWidth="2" strokeDasharray="5 4" points={dayPts} />
                            <polyline fill="none" stroke="#4ade80" strokeWidth="3" points={cumPts} />
                            {chartData.map((d, i) => {
                              const cy = py(d.cumulativeTotalScore || 0);
                              const x = px(i);
                              const showLabel = i === 0 || i === chartData.length - 1 || i % Math.max(1, Math.ceil(chartData.length / 7)) === 0;
                              return (
                                <g key={d.date}>
                                  <circle cx={x} cy={cy} r="3.5" fill="#4ade80" />
                                  {showLabel && <text x={x} y={chartH + 16} textAnchor="middle" fill="#fff" fontSize="9" opacity="0.7">{d.date.slice(5)}</text>}
                                  {showLabel && <text x={x} y={cy - 6} textAnchor="middle" fill="#4ade80" fontSize="9" fontWeight="700">{formatMetric(d.cumulativeTotalScore || 0)}</text>}
                                </g>
                              );
                            })}
                            <text x="8" y="16" fill="#4ade80" fontSize="10" fontWeight="700">● Cumulative</text>
                            <text x="100" y="16" fill="#fde68a" fontSize="10" fontWeight="700">╌ Daily</text>
                          </svg>
                        </div>
                      );
                    })()}

                    {historyPlan.planTransactions.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.8 }}>Transaction Log</div>
                        <div style={{ ...s.planTimeline, maxHeight: 240 }}>
                          {historyPlan.planTransactions.map((tx, index) => {
                            const isDrain = tx.source === 'daily-drain';
                            const isSleep = tx.activityName === 'Sleep';
                            const rowStyle = isDrain
                              ? { ...s.planTimelineRow, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }
                              : isSleep
                                ? { ...s.planTimelineRow, background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.22)' }
                                : s.planTimelineRow;
                            const nameStyle = isDrain ? { ...s.planTimelineName, color: '#fca5a5' } : isSleep ? { ...s.planTimelineName, color: '#93c5fd' } : s.planTimelineName;
                            const icon = isDrain ? '📉' : isSleep ? '😴' : '🏃';
                            return (
                              <div key={`hist-${tx.date}-${tx.activityName}-${index}`} style={rowStyle}>
                                <div style={s.planTimelineDate}>{formatDisplayDate(tx.date)}</div>
                                <div style={s.planTimelineBody}>
                                  <div style={nameStyle}>{icon} {tx.activityName}</div>
                                  <div style={s.planTimelineDetail}>{tx.detail}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scoring Rules */}
        <div style={{ ...s.card, marginTop: 14 }}>
          <button type="button" onClick={() => setShowScoringRules((current) => !current)} style={s.sectionToggleBtn}>
            <span>Scoring Rules</span>
            <span>{showScoringRules ? 'Hide' : 'Show'}</span>
          </button>
          {showScoringRules && (
            <div style={s.sectionContent}>
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={s.rulesTable}>
                  <thead>
                    <tr>
                      <th style={s.rulesTh}>Activity</th>
                      <th style={s.rulesTh}>Physical</th>
                      <th style={s.rulesTh}>Mental</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoringRules.activities.map((rule) => (
                      <tr key={rule.key}>
                        <td style={s.rulesTd}>{rule.icon} {rule.label}</td>
                        <td style={{ ...s.rulesTd, color: rule.physicalMultiplier < 0 ? '#fca5a5' : s.rulesTd.color }}>{rule.physicalMultiplier ? formatFormula(rule.physicalMultiplier, rule.physicalDivisor, rule.unit) : '—'}</td>
                        <td style={{ ...s.rulesTd, color: rule.mentalMultiplier < 0 ? '#fca5a5' : s.rulesTd.color }}>{rule.mentalMultiplier ? formatFormula(rule.mentalMultiplier, rule.mentalDivisor, rule.unit) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <td style={s.rulesTd}>😴 Sleep</td>
                      <td style={{ ...s.rulesTd, colSpan: 2 }} colSpan={2}>Baseline {formatMetric(scoringRules.sleep.baselineHours)} hrs. Every {formatMetric(scoringRules.sleep.stepHours)} hrs changes physical and mental by {formatMetric(scoringRules.sleep.scorePerStep)}.</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                      <td style={{ ...s.rulesTd, fontWeight: 700 }}>📉 Daily drain</td>
                      <td style={{ ...s.rulesTd, color: '#f87171', fontWeight: 700 }}>-{formatMetric(currentPenalty.physical)}</td>
                      <td style={{ ...s.rulesTd, color: '#f87171', fontWeight: 700 }}>-{formatMetric(currentPenalty.mental)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.6 }}>
                Scores are recalculated from these rules for the full active plan whenever wellness data is loaded. If Hardi changes the rules from the admin page, the plan totals and day-wise graph update from the new rule set.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ===================== STYLES ===================== */
const pageKeyframes = `
  @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .henna-page *{box-sizing:border-box}
  .henna-page button{transition:transform .12s,box-shadow .15s}
  .henna-page button:hover{transform:translateY(-1px)}
  .henna-page button:active{transform:scale(0.97)}
  @media(max-width:840px){
    .main-grid{grid-template-columns:1fr!important}
    .score-strip{grid-template-columns:1fr 1fr!important}
    .dash-grid{grid-template-columns:1fr!important}
    .activity-grid{grid-template-columns:repeat(4,1fr)!important}
    .field-row{flex-direction:column!important}
    .plan-stats-grid{grid-template-columns:1fr 1fr!important}
  }
  @media(max-width:480px){
    .score-strip{grid-template-columns:1fr 1fr!important;gap:8px!important}
    .activity-grid{grid-template-columns:repeat(3,1fr)!important}
  }
  input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1)}
`;

const glass = {
  borderRadius: 20,
  background: 'rgba(255,255,255,0.10)',
  backdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,0.12)',
};

const s = {
  bgWrap: { position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' },
  bgSky: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#1a1032 0%,#2d1548 22%,#6b2f5b 48%,#d97a52 74%,#f8d8b8 100%)' },
  bgGlow: { position: 'absolute', top: '8%', left: '60%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,223,186,0.40),transparent 68%)', filter: 'blur(10px)' },
  bgMountains: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  loadingPage: { position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loadingCard: { position: 'relative', zIndex: 1, padding: '28px 34px', borderRadius: 28, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(20px)', color: '#fff', textAlign: 'center' },
  loadingOrb: { width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#fb7185,#f59e0b)', animation: 'floaty 1.5s ease-in-out infinite', margin: '0 auto 12px' },
  loadingTitle: { fontWeight: 800, fontSize: 20 },
  page: { position: 'relative', zIndex: 1, minHeight: '100vh', padding: '16px', color: '#fff', fontFamily: '"Segoe UI","Inter",system-ui,sans-serif', boxSizing: 'border-box', maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#ffe6c7', fontWeight: 700, marginBottom: 4 },
  title: { margin: 0, fontSize: 'clamp(24px,4vw,34px)', fontWeight: 900, lineHeight: 1.1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  weatherPill: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, ...glass, fontSize: 13 },
  chipBtn: { border: '1px solid rgba(255,255,255,0.18)', borderRadius: 999, padding: '8px 16px', background: 'rgba(255,255,255,0.10)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  scoreStrip: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 10 },
  scoreCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', ...glass, borderRadius: 16, transition: 'transform .15s', cursor: 'default' },
  scoreIcon: { fontSize: 26 },
  scoreLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7, fontWeight: 700 },
  scoreNum: { fontSize: 22, fontWeight: 900, lineHeight: 1.2 },
  weeklySummary: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 },
  weeklyItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' },
  weeklyIcon: { fontSize: 16 },
  weeklyLabel: { fontSize: 11, opacity: 0.6, fontWeight: 600, flex: 1 },
  weeklyVal: { fontSize: 16, fontWeight: 800 },
  mainGrid: { display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14, alignItems: 'start' },
  card: { ...glass, padding: '18px 20px' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: 800 },
  dateInput: { borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', padding: '8px 12px', background: 'rgba(36,18,47,0.30)', color: '#fff', fontSize: 13, outline: 'none' },
  toggleRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  planCard: { marginBottom: 14, padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', display: 'grid', gap: 10 },
  planHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  planTitle: { fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 },
  planMenuWrap: { position: 'relative' },
  planIconBtn: { width: 34, height: 34, borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer' },
  planMenu: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 220, padding: 6, borderRadius: 14, background: 'rgba(29,18,44,0.95)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(18px)', display: 'grid', gap: 4, zIndex: 3, boxShadow: '0 14px 40px rgba(0,0,0,0.28)' },
  planMenuItem: { border: 'none', borderRadius: 10, padding: '10px 12px', background: 'transparent', color: '#fff', textAlign: 'left', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  planMenuItemDisabled: { border: 'none', borderRadius: 10, padding: '10px 12px', background: 'transparent', color: 'rgba(255,255,255,0.42)', textAlign: 'left', fontSize: 13, fontWeight: 700, cursor: 'not-allowed' },
  planMenuHint: { padding: '6px 12px 4px', fontSize: 11, lineHeight: 1.4, color: 'rgba(255,255,255,0.58)' },
  planNameBtn: { marginTop: 6, padding: 0, border: 'none', background: 'transparent', color: '#fde68a', fontSize: 24, fontWeight: 900, letterSpacing: '0.02em', cursor: 'pointer', textAlign: 'left' },
  planCopy: { fontSize: 13, lineHeight: 1.5, opacity: 0.86 },
  planActionsRow: { display: 'flex', justifyContent: 'flex-start' },
  planActionBtn: { border: '1px solid rgba(255,255,255,0.16)', borderRadius: 999, padding: '7px 14px', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  planControls: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  planTextInput: { flex: 1, minWidth: 180, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', padding: '9px 12px', background: 'rgba(36,18,47,0.30)', color: '#fff', fontSize: 13, outline: 'none' },
  planBtn: { border: 'none', borderRadius: 12, padding: '9px 16px', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 13 },
  planMeta: { fontSize: 12, color: '#bbf7d0', fontWeight: 600 },
  planStatsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 },
  planStatCard: { padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'grid', gap: 4 },
  planStatLabel: { fontSize: 11, opacity: 0.65, textTransform: 'uppercase', fontWeight: 700 },
  planStatValue: { fontSize: 18, fontWeight: 900 },
  planTimeline: { maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' },
  planTimelineRow: { display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' },
  planTimelineDate: { fontSize: 12, fontWeight: 700, color: '#fde68a' },
  planTimelineBody: { display: 'grid', gap: 4 },
  planTimelineName: { fontSize: 14, fontWeight: 800, color: '#fff' },
  planTimelineDetail: { fontSize: 12, lineHeight: 1.5, opacity: 0.8 },
  noPlanMsg: { padding: '20px 4px 8px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.7 },
  historyPlanRow: { display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' },
  historyPlanName: { fontWeight: 800, fontSize: 15 },
  historyPlanDates: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  sectionToggleBtn: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', textAlign: 'left' },
  sectionContent: { marginTop: 12 },
  toggleBtn: { border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '7px 14px', background: 'transparent', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  toggleActive: { border: 'none', borderRadius: 999, padding: '7px 14px', background: 'linear-gradient(135deg,#fb7185,#f97316)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  trackingOn: { border: 'none', borderRadius: 999, padding: '7px 14px', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  activityGrid: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 },
  actBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 4px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', transition: 'all .15s' },
  actBtnActive: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 4px', borderRadius: 14, border: '2px solid #fb7185', background: 'rgba(251,113,133,0.18)', color: '#fff', cursor: 'pointer', boxShadow: '0 0 12px rgba(251,113,133,0.25)' },
  fieldRow: { display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 14, animation: 'fadeIn .2s ease-out' },
  fieldGroup: { flex: 1 },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, opacity: 0.7, textTransform: 'uppercase' },
  fieldInput: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', padding: '10px 12px', background: 'rgba(36,18,47,0.30)', color: '#fff', fontSize: 15, outline: 'none' },
  addBtn: { border: 'none', borderRadius: 12, padding: '10px 22px', background: 'linear-gradient(135deg,#fb7185,#f97316)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(251,113,133,0.25)' },
  textRow: { display: 'flex', gap: 8 },
  textInput: { flex: 1, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', padding: '10px 14px', background: 'rgba(36,18,47,0.26)', color: '#fff', fontSize: 14, outline: 'none' },
  voiceRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' },
  micBtn: { border: 'none', borderRadius: 999, padding: '8px 16px', background: 'linear-gradient(135deg,#0ea5e9,#2563eb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  micActive: { border: 'none', borderRadius: 999, padding: '8px 16px', background: 'linear-gradient(135deg,#f43f5e,#e11d48)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  langSelect: { borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', padding: '8px 10px', background: 'rgba(36,18,47,0.26)', color: '#fff', outline: 'none', fontSize: 12 },
  replyBubble: { marginTop: 12, padding: '12px 16px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(251,113,133,0.12),rgba(249,115,22,0.10))', border: '1px solid rgba(251,113,133,0.15)', fontSize: 14, lineHeight: 1.5, animation: 'fadeIn .25s ease-out' },
  warnText: { marginTop: 8, fontSize: 12, color: '#fde68a', lineHeight: 1.5 },
  metaText: { marginTop: 6, fontSize: 12, opacity: 0.7 },
  loggedSection: { marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.10)' },
  loggedTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' },
  loggedList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  loggedItem: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', fontSize: 13, border: '1px solid rgba(255,255,255,0.06)' },
  targetCard: { padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', marginTop: 10, border: '1px solid rgba(255,255,255,0.06)', transition: 'background .15s' },
  progressTrack: { height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginTop: 8, marginBottom: 6, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 4, transition: 'width .4s ease-out' },
  breakdownGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 },
  breakdownItem: { display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)' },
  dashSection: { marginTop: 14 },
  dashGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  chartWrap: { marginTop: 8, padding: '8px 0', overflow: 'hidden' },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 8, marginBottom: 12 },
  statBox: { padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)' },
  statLabel: { fontSize: 11, textTransform: 'uppercase', opacity: 0.7, fontWeight: 700 },
  statVal: { fontSize: 18, fontWeight: 900, marginTop: 2 },
  logRow: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', fontSize: 13, marginTop: 4 },
  buddyLeaderboardWrap: { display: 'grid', gap: 8, marginTop: 8 },
  buddyLeaderboardHead: { display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) 110px 170px', gap: 8, padding: '0 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.68 },
  buddyLeaderboardRow: { display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) 110px 170px', gap: 8, alignItems: 'center', padding: '10px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' },
  buddyRank: { fontSize: 18, fontWeight: 900, textAlign: 'center' },
  buddyIdentityCol: { minWidth: 0 },
  buddyNameLine: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  buddyName: { fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  buddySelfBadge: { fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: '#bbf7d0', background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.34)' },
  buddyMetaLine: { fontSize: 11, opacity: 0.72, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  buddyScore: { textAlign: 'right', fontSize: 16, fontWeight: 900, color: '#86efac' },
  buddyTrendWrap: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center' },
  rulesTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13, lineHeight: 1.6 },
  rulesTh: { textAlign: 'left', padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, borderBottom: '1px solid rgba(255,255,255,0.12)' },
  rulesTd: { padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' },
};
