import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

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
} from '../lib/wellnessScoring';

const STORAGE_LANG_KEY = 'cosmix-henna-language';
function storageKey(userId, suffix) { return `cosmix-wellness-${userId}-${suffix}`; }

/* ---------- activity dropdown config ---------- */
const ACTIVITY_OPTIONS = [
  { id: 'running', label: 'Running', icon: '🏃', fields: [{ key: 'runningDistanceKm', label: 'Distance', unit: 'km', step: 0.1 }, { key: 'runningMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'walking', label: 'Walking', icon: '🚶', fields: [{ key: 'walkingDistanceKm', label: 'Distance', unit: 'km', step: 0.1 }, { key: 'walkingMinutes', label: 'Time', unit: 'mins', step: 1 }] },
  { id: 'exercise', label: 'Workout', icon: '💪', fields: [{ key: 'exerciseMinutes', label: 'Time', unit: 'mins', step: 1 }] },
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

  const showMicSecurityWarning = typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost';

  const API_BASE = typeof window !== 'undefined'
    ? ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${window.location.protocol}//${window.location.hostname}:3004`
      : '')
    : '';
  const saveTimerRef = useRef(null);

  /* ---- init (runs once) ---- */
  useEffect(() => {
    if (typeof window === 'undefined' || initDoneRef.current) return;
    const storedUser = localStorage.getItem('user');
    if (!storedUser) { router.push('/'); return; }
    const parsed = JSON.parse(storedUser);
    const uid = parsed.id || parsed.email || parsed.username || 'default';
    userIdRef.current = uid;
    setUser(parsed);

    // Load from localStorage first (instant)
    const localEntries = parseStoredJson(storageKey(uid, 'entries'), []);
    const localForm = parseStoredJson(storageKey(uid, 'form'), DEFAULT_FORM);
    const today = todayDate();
    const todayEntry = localEntries.find((e) => e.date === today);
    const resolvedForm = todayEntry || { ...DEFAULT_FORM, ...localForm, date: today };
    setEntries(localEntries);
    setForm(resolvedForm);
    setSelectedDate(today);
    const storedLanguage = localStorage.getItem(STORAGE_LANG_KEY);
    if (storedLanguage && LANGUAGE_OPTIONS.some((o) => o.value === storedLanguage)) setVoiceLanguage(storedLanguage);
    initDoneRef.current = true;
    setLoading(false);

    // Then try loading from server (overrides if server has data)
    fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((serverData) => {
        if (!serverData) return;
        const sEntries = serverData.entries || [];
        const sForm = serverData.form || null;
        if (sEntries.length > 0) {
          // Merge: server entries take priority by date
          const merged = [...sEntries];
          const serverDates = new Set(sEntries.map((e) => e.date));
          localEntries.forEach((e) => { if (!serverDates.has(e.date)) merged.push(e); });
          setEntries(merged);
          localStorage.setItem(storageKey(uid, 'entries'), JSON.stringify(merged));
          const sTodayEntry = merged.find((e) => e.date === today);
          if (sTodayEntry) setForm(sTodayEntry);
        }
        if (sForm && sEntries.length === 0 && localEntries.length === 0) {
          setForm({ ...DEFAULT_FORM, ...sForm, date: today });
        }
      })
      .catch(() => { /* server offline, localStorage is fine */ });

    // Handle Strava OAuth result (server-side callback redirects here with ?strava=ok)
    const urlParams = new URLSearchParams(window.location.search);
    const stravaResult = urlParams.get('strava');
    if (stravaResult) {
      window.history.replaceState({}, '', window.location.pathname);
      if (stravaResult === 'ok') {
        setStravaConnected(true);
        setStravaMsg('Strava connected! Syncing activities...');
        // Immediately fetch activities after connect
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

    // Check Strava connection status & auto-fill
    fetch(`${API_BASE}/wellness/strava/status/${encodeURIComponent(uid)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.connected) return;
        setStravaConnected(true);
        // Auto-fetch today's activities
        return fetch(`${API_BASE}/wellness/strava/activities/${encodeURIComponent(uid)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((actData) => {
            if (!actData?.fields || Object.keys(actData.fields).length === 0) return;
            setStravaMsg(`Strava: ${actData.activities} activities synced`);
            // Auto-fill only empty fields in current form
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
  }, [API_BASE, router]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- sync to server (debounced) ---- */
  function syncToServer(newEntries, newForm) {
    const uid = userIdRef.current;
    if (!uid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: newEntries, form: newForm }),
      }).catch(() => { /* server offline, silent fail */ });
    }, 1500);
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
    localStorage.setItem(storageKey(userIdRef.current, 'form'), JSON.stringify(form));
    syncToServer(entries, form);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!initDoneRef.current || !userIdRef.current) return;
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
    setEntries((cur) => [entry, ...cur.filter((e) => e.date !== entry.date)].slice(0, 60));
    setForm(entry);
    return entry;
  }

  /* ---- dropdown save ---- */
  function handleDropdownSave() {
    const actCfg = ACTIVITY_OPTIONS.find((a) => a.id === selectedActivity);
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
    setAssistantReply(`Added: ${formatUpdateList(updates)}`);
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
  const stats = useMemo(() => computeDashboardStats(entries, form), [entries, form]);
  const todayScores = useMemo(() => computeEntryScores(form), [form]);

  const recentRunning = useMemo(
    () => (entries.length ? entries : [form]).filter((e) => Number(e.runningDistanceKm || 0) > 0 || Number(e.runningMinutes || 0) > 0).slice(0, 5),
    [entries, form],
  );

  const recentWalking = useMemo(
    () => (entries.length ? entries : [form]).filter((e) => Number(e.walkingDistanceKm || 0) > 0 || Number(e.walkingMinutes || 0) > 0).slice(0, 5),
    [entries, form],
  );

  const selectedActivityConfig = ACTIVITY_OPTIONS.find((a) => a.id === selectedActivity);

  /* ---- chart data ---- */
  const weekChartData = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const entry = (dateStr === form.date) ? form : entries.find((e) => e.date === dateStr);
      const scores = entry ? computeEntryScores(entry) : { physicalScore: 0, mentalScore: 0, totalScore: 0, workoutMinutes: 0 };
      days.push({ date: dateStr, dayLabel: d.toLocaleDateString('en', { weekday: 'short' }), ...scores });
    }
    return days;
  }, [entries, form]);

  const activityBreakdown = useMemo(() => {
    const week = [form, ...entries.filter((e) => e.date !== form.date)].slice(0, 7);
    const totals = [
      { label: 'Running', icon: '🏃', mins: week.reduce((s, e) => s + Number(e.runningMinutes || 0), 0), color: '#fb7185' },
      { label: 'Walking', icon: '🚶', mins: week.reduce((s, e) => s + Number(e.walkingMinutes || 0), 0), color: '#a3e635' },
      { label: 'Workout', icon: '💪', mins: week.reduce((s, e) => s + Number(e.exerciseMinutes || 0), 0), color: '#f59e0b' },
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
    if (Number(form.walkingDistanceKm || 0) > 0 || Number(form.walkingMinutes || 0) > 0) list.push({ icon: '🚶', label: 'Walking', detail: `${formatMetric(form.walkingDistanceKm)} km · ${formatMetric(form.walkingMinutes)} mins` });
    if (Number(form.exerciseMinutes || 0) > 0) list.push({ icon: '💪', label: 'Workout', detail: `${formatMetric(form.exerciseMinutes)} mins` });
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
            <button onClick={() => router.push('/dashboard')} style={s.chipBtn}>Dashboard</button>
          </div>
        </div>

        {/* scores on top */}
        <div style={s.scoreStrip} className="score-strip">
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>🏋️</div>
            <div>
              <div style={s.scoreLabel}>Physical</div>
              <div style={s.scoreNum}>{formatMetric(stats.totalPhysicalScore)}</div>
            </div>
          </div>
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>🧠</div>
            <div>
              <div style={s.scoreLabel}>Mental</div>
              <div style={s.scoreNum}>{formatMetric(stats.totalMentalScore)}</div>
            </div>
          </div>
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>⚡</div>
            <div>
              <div style={s.scoreLabel}>Total</div>
              <div style={s.scoreNum}>{formatMetric(stats.totalBodyScore)}</div>
            </div>
          </div>
          <div style={s.scoreCard}>
            <div style={s.scoreIcon}>📅</div>
            <div>
              <div style={s.scoreLabel}>Today</div>
              <div style={s.scoreNum}>{formatMetric(todayScores.totalScore)}</div>
            </div>
          </div>
        </div>

        {/* weekly summary bar */}
        <div style={s.weeklySummary} className="score-strip">
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
        </div>

        {/* main grid */}
        <div style={s.mainGrid} className="main-grid">
          {/* left: add activity */}
          <div style={s.card}>
            <div style={s.cardHead}>
              <span style={s.cardTitle}>Add Activity</span>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={s.dateInput} max={todayDate()} />
            </div>

            <div style={s.toggleRow}>
              <button onClick={() => setInputMode('dropdown')} style={inputMode === 'dropdown' ? s.toggleActive : s.toggleBtn}>Dropdown</button>
              <button onClick={() => setInputMode('text')} style={inputMode === 'text' ? s.toggleActive : s.toggleBtn}>Text / Voice</button>
            </div>

            {inputMode === 'dropdown' ? (
              <>
                <div style={s.activityGrid} className="activity-grid">
                  {ACTIVITY_OPTIONS.map((a) => (
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
          </div>

          {/* right: readiness targets */}
          <div style={s.card}>
            <div style={s.cardTitle}>Readiness Targets</div>
            {[
              { label: 'Hampta Pass', ...stats.readiness.hamptaPass, color: '#fb7185' },
              { label: 'Skiing Feb 2027', ...stats.readiness.skiing2027, color: '#38bdf8' },
              { label: 'Marathon 10km', ...stats.readiness.marathon10k, color: '#f59e0b' },
            ].map((t) => (
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

            <div style={{ ...s.cardTitle, marginTop: 20 }}>Today&apos;s Breakdown</div>
            <div style={s.breakdownGrid}>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Physical</span><span style={{ fontWeight: 800 }}>{formatMetric(todayScores.physicalScore)}</span></div>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Mental</span><span style={{ fontWeight: 800 }}>{formatMetric(todayScores.mentalScore)}</span></div>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Workout mins</span><span style={{ fontWeight: 800 }}>{formatMetric(todayScores.workoutMinutes)}</span></div>
              <div style={s.breakdownItem}><span style={{ fontSize: 12, opacity: 0.7 }}>Sleep effect</span><span style={{ fontWeight: 800, color: todayScores.sleepPhysical > 0 ? '#4ade80' : todayScores.sleepPhysical < 0 ? '#f87171' : '#94a3b8' }}>{todayScores.sleepPhysical > 0 ? '+' : ''}{formatMetric(todayScores.sleepPhysical)}</span></div>
            </div>
          </div>
        </div>

        {/* ---- Charts Section ---- */}
        <div style={s.dashSection}>
          <div style={s.dashGrid} className="dash-grid">
            {/* Weekly Score Bar Chart */}
            <div style={s.card}>
              <div style={s.cardTitle}>📊 Weekly Score Trend</div>
              <div style={s.chartWrap}>
                {(() => {
                  const maxScore = Math.max(1, ...weekChartData.map((d) => Math.abs(d.totalScore)));
                  const barW = 100 / 7;
                  const chartH = 140;
                  const zeroY = weekChartData.some((d) => d.totalScore < 0) ? chartH * 0.75 : chartH;
                  return (
                    <svg viewBox={`0 0 320 ${chartH + 28}`} style={{ width: '100%', height: chartH + 28 }}>
                      {/* grid lines */}
                      {[0.25, 0.5, 0.75, 1].map((f) => (
                        <line key={f} x1="0" x2="320" y1={zeroY - zeroY * f} y2={zeroY - zeroY * f} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      ))}
                      {weekChartData.map((d, i) => {
                        const barH = (Math.abs(d.totalScore) / maxScore) * (d.totalScore >= 0 ? zeroY : chartH - zeroY);
                        const x = i * (320 / 7) + (320 / 7 - 28) / 2;
                        const y = d.totalScore >= 0 ? zeroY - barH : zeroY;
                        const isToday = d.date === todayDate();
                        return (
                          <g key={d.date}>
                            <rect x={x} y={y} width="28" height={Math.max(barH, 2)} rx="6"
                              fill={d.totalScore < 0 ? '#f87171' : isToday ? 'url(#barGrad)' : 'rgba(255,255,255,0.18)'}
                            />
                            <text x={x + 14} y={y - 4} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" opacity="0.9">
                              {d.totalScore !== 0 ? formatMetric(d.totalScore) : ''}
                            </text>
                            <text x={x + 14} y={chartH + 18} textAnchor="middle" fill="#fff" fontSize="10" fontWeight={isToday ? '800' : '500'} opacity={isToday ? 1 : 0.55}>
                              {d.dayLabel}
                            </text>
                          </g>
                        );
                      })}
                      {/* zero line */}
                      {weekChartData.some((d) => d.totalScore < 0) && (
                        <line x1="0" x2="320" y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4" />
                      )}
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb7185" />
                          <stop offset="100%" stopColor="#f97316" />
                        </linearGradient>
                      </defs>
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

        {/* Scoring Rules */}
        <div style={{ ...s.card, marginTop: 14 }}>
          <div style={s.cardTitle}>📐 Scoring Rules</div>
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
                <tr><td style={s.rulesTd}>🏃 Running</td><td style={s.rulesTd}>distance × 0.9</td><td style={s.rulesTd}>distance × 0.4</td></tr>
                <tr><td style={s.rulesTd}>🚶 Walking</td><td style={s.rulesTd}>distance × 0.3</td><td style={s.rulesTd}>(mins / 30) × 0.25</td></tr>
                <tr><td style={s.rulesTd}>💪 Workout</td><td style={s.rulesTd}>(mins / 30) × 0.8</td><td style={s.rulesTd}>(mins / 30) × 0.5</td></tr>
                <tr><td style={s.rulesTd}>🏸 Badminton</td><td style={s.rulesTd}>(mins / 60) × 1.2</td><td style={s.rulesTd}>(mins / 30) × 0.5</td></tr>
                <tr><td style={s.rulesTd}>⚽ Football</td><td style={s.rulesTd}>(mins / 60) × 2</td><td style={s.rulesTd}>(mins / 30) × 0.5</td></tr>
                <tr><td style={s.rulesTd}>🏏 Cricket</td><td style={s.rulesTd}>(mins / 60) × 1.5</td><td style={s.rulesTd}>(mins / 30) × 0.5</td></tr>
                <tr><td style={s.rulesTd}>🏊 Swimming</td><td style={s.rulesTd}>(mins / 30) × 0.7</td><td style={s.rulesTd}>(mins / 30) × 1</td></tr>
                <tr><td style={s.rulesTd}>🧘 Meditation</td><td style={s.rulesTd}>(mins / 30) × 0.2</td><td style={s.rulesTd}>(mins / 30) × 1.5</td></tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}><td style={s.rulesTd}>😴 Sleep</td><td style={{ ...s.rulesTd, colSpan: 2 }} colSpan={2}>6.5 hrs = 0. Every ±30 min → ±0.5 physical &amp; ±0.5 mental</td></tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}><td style={s.rulesTd}>🥃 Whisky</td><td style={{ ...s.rulesTd, color: '#f87171' }}>pegs × -1.1</td><td style={s.rulesTd}>—</td></tr>
                <tr><td style={s.rulesTd}>🍔 Fast food</td><td style={{ ...s.rulesTd, color: '#f87171' }}>count × -0.9</td><td style={s.rulesTd}>—</td></tr>
                <tr><td style={s.rulesTd}>🍬 Sugar</td><td style={{ ...s.rulesTd, color: '#f87171' }}>count × -2</td><td style={s.rulesTd}>—</td></tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}><td style={{ ...s.rulesTd, fontWeight: 700 }}>📉 Daily drain</td><td style={{ ...s.rulesTd, color: '#f87171', fontWeight: 700 }}>-2.7</td><td style={{ ...s.rulesTd, color: '#f87171', fontWeight: 700 }}>-1.0</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.6 }}>
            Daily drain always applies (body decay + office/life). Activities and sleep offset it. Score accumulates over 14 days.
          </div>
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
  rulesTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13, lineHeight: 1.6 },
  rulesTh: { textAlign: 'left', padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, borderBottom: '1px solid rgba(255,255,255,0.12)' },
  rulesTd: { padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' },
};
