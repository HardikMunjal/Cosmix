import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';

// ── Storage keys ──────────────────────────────────────────────
const STORAGE_ENTRIES_KEY  = 'cosmix-wellness-entries';
const STORAGE_GOALS_KEY    = 'cosmix-wellness-goals';
const STORAGE_LAST_FORM_KEY= 'cosmix-wellness-form';
const STORAGE_GREETED_KEY  = 'cosmix-astra-greeted';
const STORAGE_CONV_KEY     = 'cosmix-astra-conversations';

const SILENCE_NUDGE_MS = 42000; // 42 s of silence -> Astra nudges

const NUDGE_LINES = [
  "Yaar, still there? I am right here — just say something!",
  "Arre, how is your body feeling right now? Mountains don't wait!",
  "Don't go quiet on me! Even a quick note helps your trek prep.",
  "Your Hampta Pass goal is calling. How did today go, yaar?",
  "Come on, what is on your mind? I am listening.",
  "No pressure, but the mountains are calling — how are you doing?",
];

const TREK_QUOTES = [
  { quote: "The mountains are calling and I must go.", author: "John Muir" },
  { quote: "It is not the mountain we conquer but ourselves.", author: "Sir Edmund Hillary" },
  { quote: "Every mountain top is within reach if you just keep climbing.", author: "Barry Finlay" },
  { quote: "The summit is what drives us, but the climb itself is what matters.", author: "Conrad Anker" },
  { quote: "Great things are done when men and mountains meet.", author: "William Blake" },
  { quote: "In the mountains, there is the greatest freedom.", author: "Markus Zusak" },
  { quote: "Somewhere between the bottom and the summit is the answer to why we climb.", author: "Greg Child" },
];

// ── Weather helpers ───────────────────────────────────────────
function weatherIcon(code) {
  if (code === 0) return '\u2600\uFE0F';          // sunny
  if (code <= 3)  return '\u26C5';                // partly cloudy
  if (code <= 48) return '\uD83C\uDF2B\uFE0F';   // fog
  if (code <= 67) return '\uD83C\uDF27\uFE0F';   // rain
  if (code <= 77) return '\u2744\uFE0F';          // snow
  if (code <= 82) return '\uD83C\uDF26\uFE0F';   // showers
  return '\u26C8\uFE0F';                          // thunderstorm
}
function weatherDesc(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 3)  return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
}

// ── Activity fields ───────────────────────────────────────────
const ACTIVITY_FIELDS = [
  { key: 'runningMinutes',    label: 'Running',        unit: 'mins',     color: '#fb7185' },
  { key: 'meditationMinutes', label: 'Meditation',     unit: 'mins',     color: '#38bdf8' },
  { key: 'headacheLevel',     label: 'Headache',       unit: '/10',      color: '#f59e0b' },
  { key: 'exerciseMinutes',   label: 'Exercise',       unit: 'mins',     color: '#f97316' },
  { key: 'fastFoodServings',  label: 'Fast food',      unit: 'servings', color: '#f87171' },
  { key: 'cricketMinutes',    label: 'Cricket',        unit: 'mins',     color: '#a78bfa' },
  { key: 'footballMinutes',   label: 'Football',       unit: 'mins',     color: '#22c55e' },
  { key: 'badmintonMinutes',  label: 'Badminton',      unit: 'mins',     color: '#facc15' },
  { key: 'swimmingMinutes',   label: 'Swimming',       unit: 'mins',     color: '#60a5fa' },
];

const DEFAULT_FORM = {
  date: new Date().toISOString().slice(0, 10),
  runningMinutes: 0, meditationMinutes: 10,
  headacheLevel: 0,  exerciseMinutes: 20,   fastFoodServings: 0,
  cricketMinutes: 0, footballMinutes: 0,    badmintonMinutes: 0,
  swimmingMinutes: 0, moodScore: 7, notes: '',
};

function getApiBase() {
  if (typeof window === 'undefined') return 'http://localhost:3000';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }
  return '';
}
function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
}
function parseStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

// ── Voice picker — Indian English first ──────────────────────
function pickBestVoice(voices) {
  const tiers = [
    // Indian English — best options
    (v) => /microsoft heera/i.test(v.name),     // Windows Indian English female
    (v) => /microsoft ravi/i.test(v.name),      // Windows Indian English male
    (v) => v.lang === 'en-IN',                  // Any native en-IN voice
    (v) => /google.*en-in/i.test(v.name),
    (v) => /veena/i.test(v.name),
    (v) => /priya/i.test(v.name),
    // Fallback — quality neural voices
    (v) => /microsoft.*natural.*en/i.test(v.name),
    (v) => /microsoft.*online.*natural/i.test(v.name),
    (v) => /google.*wavenet/i.test(v.name),
    (v) => /google uk english female/i.test(v.name),
    (v) => /samantha/i.test(v.name),
    (v) => /karen/i.test(v.name),
    (v) => /aria/i.test(v.name),
    (v) => /female/i.test(v.name),
  ];
  for (const test of tiers) {
    const found = voices.find(test);
    if (found) return found;
  }
  return voices.find((v) => /en-IN/i.test(v.lang))
      || voices.find((v) => /en/i.test(v.lang))
      || voices[0] || null;
}

function parseTranscriptIntoForm(form, transcript) {
  const next = { ...form };
  const patterns = [
    ['runningMinutes',    /(run|running)\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
    ['meditationMinutes', /(meditat(?:e|ed|ion))\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
    ['exerciseMinutes',   /(exercise|workout|gym)\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
    ['headacheLevel',     /(headache)\s+(level\s+)?(\d+(?:\.\d+)?)\s*(out of 10|\/10)?/i],
    ['fastFoodServings',  /(fast food|burger|pizza)\s+(\d+(?:\.\d+)?)\s*(times|servings)?/i],
    ['cricketMinutes',    /(cricket)\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
    ['footballMinutes',   /(football)\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
    ['badmintonMinutes',  /(badminton)\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
    ['swimmingMinutes',   /(swimming|swim)\s+(for\s+)?(\d+(?:\.\d+)?)\s*(minutes|mins|min)?/i],
  ];
  patterns.forEach(([field, regex]) => {
    const match = transcript.match(regex);
    if (!match) return;
    const num = match.slice().reverse().find((v) => /^\d+(?:\.\d+)?$/.test(v));
    if (num) next[field] = Number(num);
  });
  const moodMatch = transcript.match(/mood\s+(\d+(?:\.\d+)?)\s*(out of 10|\/10)?/i);
  if (moodMatch) next.moodScore = Number(moodMatch[1]);
  next.notes = [form.notes, transcript].filter(Boolean).join(form.notes ? '\n' : '');
  return next;
}

// Daily quote (rotates each calendar day)
const dailyQuote = TREK_QUOTES[new Date().getDate() % TREK_QUOTES.length];

// ── Mountain background component ────────────────────────────
function MountainBg() {
  return (
    <div style={styles.mountainBgFixed} aria-hidden="true">
      {/* Sky gradient */}
      <div style={styles.mountainSky} />
      {/* Stars */}
      <div style={styles.starField} />
      {/* Sun glow at horizon */}
      <div style={styles.sunGlow} />
      {/* Mountain SVG layers */}
      <svg
        style={styles.mountainSvgLayer}
        viewBox="0 0 1440 500"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Far range — misty indigo */}
        <polygon
          points="0,500 0,290 200,170 420,250 640,135 860,225 1080,155 1300,215 1440,185 1440,500"
          fill="rgba(99,102,241,0.42)"
        />
        {/* Mid range — deep navy */}
        <polygon
          points="0,500 0,345 175,270 355,310 535,238 715,278 895,227 1075,265 1255,232 1440,252 1440,500"
          fill="rgba(30,58,138,0.58)"
        />
        {/* Snow caps */}
        <polygon points="535,238 548,210 568,224 585,198 605,218 622,207 637,220 658,238" fill="rgba(255,255,255,0.55)" />
        <polygon points="860,225 875,198 895,215 912,192 932,212 948,225" fill="rgba(255,255,255,0.5)" />
        <polygon points="200,270 215,242 232,258 250,238 268,252 282,270" fill="rgba(255,255,255,0.45)" />
        {/* Near silhouette */}
        <polygon
          points="0,500 0,392 138,367 298,383 458,354 618,370 778,349 938,365 1098,350 1258,360 1440,349 1440,500"
          fill="rgba(15,23,42,0.8)"
        />
        {/* Treeline foreground */}
        <polygon
          points="0,500 0,455 40,445 75,450 105,440 135,452 170,444 210,450 245,440 280,450 315,440 350,452 385,442 420,452 455,440 490,452 525,442 560,452 600,440 640,454 680,442 720,450 760,437 800,452 840,442 880,450 920,440 960,454 1000,440 1040,450 1080,438 1120,452 1160,440 1200,450 1240,442 1280,452 1320,440 1360,448 1400,438 1440,447 1440,500"
          fill="rgba(2,6,23,0.92)"
        />
      </svg>
      {/* Drifting cloud layer */}
      <svg
        style={{ ...styles.mountainSvgLayer, top: '8%', animation: 'cloudDrift 35s ease-in-out infinite alternate' }}
        viewBox="0 0 1440 180"
        preserveAspectRatio="xMidYMid slice"
      >
        <ellipse cx="280"  cy="70"  rx="160" ry="34" fill="rgba(255,255,255,0.06)" />
        <ellipse cx="760"  cy="55"  rx="210" ry="38" fill="rgba(255,255,255,0.05)" />
        <ellipse cx="1180" cy="82"  rx="145" ry="28" fill="rgba(255,255,255,0.06)" />
      </svg>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function WellnessPage() {
  const router = useRouter();
  const recognitionRef   = useRef(null);
  const robotStageRef    = useRef(null);
  const dragStateRef     = useRef(null);
  const speechRef        = useRef({ voice: null, speaking: false });
  const nudgeTimerRef    = useRef(null);
  const subtitleTimerRef = useRef(null);
  const nudgeIndexRef    = useRef(0);

  const [user,         setUser]        = useState(null);
  const [defaults,     setDefaults]    = useState(null);  // eslint-disable-line no-unused-vars
  const [entries,      setEntries]     = useState([]);
  const [goals,        setGoals]       = useState([]);
  const [form,         setForm]        = useState(DEFAULT_FORM);
  const [coachPayload, setCoachPayload]= useState(null);
  const [coachPrompt,  setCoachPrompt] = useState('How am I doing today?');
  const [loading,      setLoading]     = useState(true);
  const [saving,       setSaving]      = useState(false);
  const [listening,    setListening]   = useState(false);
  const [transcript,   setTranscript]  = useState('');
  const [voiceStatus,  setVoiceStatus] = useState('Loading voice...');
  const [robotPos,     setRobotPos]    = useState({ x: 18, y: 20 });
  const [subtitle,     setSubtitle]    = useState('');
  const [isSpeaking,   setIsSpeaking]  = useState(false);
  const [chatHistory,  setChatHistory] = useState([]);
  const [weather,      setWeather]     = useState(null);

  // ── Auth ─────────────────────────────────────────────────────
  useEffect(() => {
    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!sessionUser) return;
      setChatHistory(parseStoredJson(STORAGE_CONV_KEY, []));
    });
  }, [router]);

  // ── Weather — Open-Meteo (free, no API key) ──────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const [wxRes, geoRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`),
          ]);
          const wx  = await wxRes.json();
          const geo = await geoRes.json();
          const code = wx.current?.weather_code ?? 0;
          setWeather({
            temp: Math.round(wx.current?.temperature_2m ?? 0),
            wind: Math.round(wx.current?.wind_speed_10m  ?? 0),
            code,
            icon: weatherIcon(code),
            desc: weatherDesc(code),
            city: geo.address?.city || geo.address?.town || geo.address?.village || 'your area',
          });
        } catch (_) { /* silently skip if fetch fails */ }
      },
      () => { /* Location denied — skip */ },
    );
  }, []);

  // ── Bootstrap + first-time greeting ──────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const response = await fetch(`${getApiBase()}/wellness/defaults`);
        const payload  = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Failed to load defaults');
        if (cancelled) return;
        setDefaults(payload);

        const storedEntries = parseStoredJson(STORAGE_ENTRIES_KEY,  []);
        const storedGoals   = parseStoredJson(STORAGE_GOALS_KEY,    payload.goals        || []);
        const storedForm    = parseStoredJson(STORAGE_LAST_FORM_KEY, payload.starterEntry || DEFAULT_FORM);

        setEntries(storedEntries);
        setGoals(storedGoals);
        setForm({ ...DEFAULT_FORM, ...storedForm, date: new Date().toISOString().slice(0, 10) });

        const alreadyGreeted = localStorage.getItem(STORAGE_GREETED_KEY);
        const greetAsk = alreadyGreeted
          ? `Welcome back ${user.username}! Give a quick, warm, friendly check-in in Indian English — how the body is doing and one key thing to focus on today. Be casual like a close friend.`
          : `Say a warm, personal Hi to ${user.username} for the very first time in Indian English! Introduce yourself as Astra, their mountain fitness and wellness buddy. Be short, energetic, and motivating like a good Indian friend — use words like yaar, arre etc naturally.`;

        const coachRes = await requestCoachRaw({
          userName:    user.username,
          latestEntry: storedEntries[0] || { ...DEFAULT_FORM, ...storedForm },
          entries:     storedEntries,
          goals:       storedGoals,
          ask:         greetAsk,
        });
        if (cancelled) return;
        setCoachPayload(coachRes);
        localStorage.setItem(STORAGE_GREETED_KEY, '1');
        pushChat('astra', coachRes.coachReply);
        setTimeout(() => speakCoach(coachRes.coachReply), 700);
      } catch (err) {
        if (!cancelled) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [user]);

  // ── Voice selection — prefer Indian English voices ────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setVoiceStatus('Speech not supported');
      return;
    }
    const assign = () => {
      const voices = window.speechSynthesis.getVoices();
      const picked = pickBestVoice(voices);
      speechRef.current.voice = picked;
      setVoiceStatus(picked ? picked.name : 'Default voice');
    };
    assign();
    window.speechSynthesis.onvoiceschanged = assign;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Silence nudge timer ───────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    resetNudgeTimer();
    return () => clearTimeout(nudgeTimerRef.current);
  }, [loading]);

  // ── Drag (desktop pointer) ────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const move = (e) => {
      if (!dragStateRef.current || !robotStageRef.current) return;
      const rect = robotStageRef.current.getBoundingClientRect();
      setRobotPos({
        x: Math.min(Math.max(e.clientX - rect.left  - dragStateRef.current.offsetX, 0), rect.width  - 120),
        y: Math.min(Math.max(e.clientY - rect.top   - dragStateRef.current.offsetY, 0), rect.height - 150),
      });
    };
    const stop = () => { dragStateRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup',   stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup',   stop);
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────
  function pushChat(role, text) {
    setChatHistory((prev) => {
      const next = [...prev, { role, text, ts: Date.now() }].slice(-40);
      localStorage.setItem(STORAGE_CONV_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetNudgeTimer() {
    clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = setTimeout(() => {
      const line = NUDGE_LINES[nudgeIndexRef.current % NUDGE_LINES.length];
      nudgeIndexRef.current += 1;
      pushChat('astra', line);
      speakCoach(line);
      resetNudgeTimer();
    }, SILENCE_NUDGE_MS);
  }

  async function requestCoachRaw({ userName, latestEntry, entries: nextEntries, goals: nextGoals, ask }) {
    const res = await fetch(`${getApiBase()}/wellness/coach`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userName, latestEntry, entries: nextEntries, goals: nextGoals, ask }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.message || 'Coach request failed');
    return payload;
  }

  async function requestCoach({ latestEntry, entries: nextEntries, goals: nextGoals, ask }) {
    if (!user) return;
    const payload = await requestCoachRaw({
      userName: user.username, latestEntry, entries: nextEntries, goals: nextGoals, ask,
    });
    setCoachPayload(payload);
    return payload;
  }

  function persistState(nextEntries, nextGoals, nextForm) {
    localStorage.setItem(STORAGE_ENTRIES_KEY,   JSON.stringify(nextEntries));
    localStorage.setItem(STORAGE_GOALS_KEY,     JSON.stringify(nextGoals));
    localStorage.setItem(STORAGE_LAST_FORM_KEY, JSON.stringify(nextForm));
  }

  async function handleSaveEntry() {
    setSaving(true);
    resetNudgeTimer();
    const entryToSave = { ...form, date: form.date || new Date().toISOString().slice(0, 10) };
    const nextEntries = [entryToSave, ...entries.filter((e) => e.date !== entryToSave.date)].slice(0, 14);
    setEntries(nextEntries);
    persistState(nextEntries, goals, entryToSave);
    pushChat('user', coachPrompt || 'Saved my day.');
    try {
      const payload = await requestCoach({ latestEntry: entryToSave, entries: nextEntries, goals, ask: coachPrompt });
      pushChat('astra', payload.coachReply);
      speakCoach(payload.coachReply);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleAskCoach() {
    if (!coachPrompt.trim()) return;
    setSaving(true);
    resetNudgeTimer();
    pushChat('user', coachPrompt);
    try {
      const payload = await requestCoach({ latestEntry: form, entries, goals, ask: coachPrompt });
      pushChat('astra', payload.coachReply);
      speakCoach(payload.coachReply);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  // Word-by-word subtitles via onboundary; Indian English lang
  function speakCoach(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    clearTimeout(subtitleTimerRef.current);

    const utterance   = new SpeechSynthesisUtterance(text);
    utterance.voice   = speechRef.current.voice;
    utterance.lang    = 'en-IN';
    utterance.rate    = 0.92;
    utterance.pitch   = 1.08;
    utterance.volume  = 1;

    const words = text.split(/\s+/);
    let wordIdx  = 0;

    utterance.onboundary = (e) => {
      if (e.name === 'word') {
        wordIdx += 1;
        setSubtitle(words.slice(Math.max(0, wordIdx - 7), wordIdx).join(' '));
      }
    };
    utterance.onstart = () => {
      setIsSpeaking(true);
      setSubtitle(words.slice(0, 7).join(' '));
      speechRef.current.speaking = true;
    };
    utterance.onend = () => {
      speechRef.current.speaking = false;
      setIsSpeaking(false);
      subtitleTimerRef.current = setTimeout(() => setSubtitle(''), 2200);
    };
    utterance.onerror = () => { setIsSpeaking(false); setSubtitle(''); };

    window.speechSynthesis.speak(utterance);
  }

  function startVoiceInput() {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceStatus('Voice input not supported in this browser'); return; }
    resetNudgeTimer();
    if (!recognitionRef.current) {
      const rec = new SR();
      rec.lang             = 'en-IN';
      rec.interimResults   = false;
      rec.maxAlternatives  = 1;
      rec.onresult = (e) => {
        const spoken = e.results?.[0]?.[0]?.transcript || '';
        setTranscript(spoken);
        const merged = parseTranscriptIntoForm(form, spoken);
        setForm(merged);
        localStorage.setItem(STORAGE_LAST_FORM_KEY, JSON.stringify(merged));
        pushChat('user', spoken);
        resetNudgeTimer();
      };
      rec.onstart  = () => setListening(true);
      rec.onend    = () => setListening(false);
      rec.onerror  = () => { setListening(false); setVoiceStatus('Could not understand mic. Try again.'); };
      recognitionRef.current = rec;
    }
    recognitionRef.current.start();
  }

  const weeklyMovement = useMemo(() =>
    entries.slice(0, 7).reduce((sum, e) =>
      sum + Number(e.runningMinutes || 0)   + Number(e.exerciseMinutes || 0)
          + Number(e.cricketMinutes || 0)   + Number(e.footballMinutes || 0)
          + Number(e.badmintonMinutes || 0) + Number(e.swimmingMinutes || 0),
    0), [entries]);

  // ── Loading screen ────────────────────────────────────────────
  if (!user || loading) {
    return (
      <div style={styles.loading}>
        <style>{loadingKeyframes}</style>
        <MountainBg />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', color: '#f8fafc' }}>
          <div style={styles.loadingDot} />
          <span style={{ fontSize: '20px', fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>Astra is waking up...</span>
          <span style={{ fontSize: '13px', opacity: 0.65 }}>Loading your mountain wellness companion</span>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────
  return (
    <>
      <style>{pageKeyframes}</style>
      <MountainBg />

      <div style={styles.page} className="wellness-page">

        {/* ── Header ── */}
        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>&#x26F0; Mountain Wellness Cockpit</div>
            <h1 style={styles.title}>Astra &middot; Your Trek Buddy</h1>
            <div style={styles.subtitle}>
              Your Indian wellness companion that talks, listens, and gets you summit-ready every single day.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', flexShrink: 0 }}>
            {weather && (
              <div style={styles.weatherWidget}>
                <span style={{ fontSize: '30px', lineHeight: 1 }}>{weather.icon}</span>
                <div>
                  <div style={styles.weatherTemp}>{weather.temp}&deg;C</div>
                  <div style={styles.weatherCity}>{weather.city}</div>
                  <div style={styles.weatherDesc}>{weather.desc} &middot; {weather.wind}&nbsp;km/h wind</div>
                </div>
              </div>
            )}
            <button onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>
              &#8592; Dashboard
            </button>
          </div>
        </div>

        {/* ── Daily trek quote ── */}
        <div style={styles.quoteCard}>
          <span style={styles.quoteIcon}>&#x1F3D4;</span>
          <div>
            <div style={styles.quoteText}>&ldquo;{dailyQuote.quote}&rdquo;</div>
            <div style={styles.quoteAuthor}>&mdash; {dailyQuote.author}</div>
          </div>
        </div>

        {/* ── Hero metrics ── */}
        <div style={styles.heroGrid} className="wellness-hero">
          <div style={styles.heroCard}>
            <div style={styles.heroMetricLabel}>Weekly movement</div>
            <div style={styles.heroMetricValue}>{weeklyMovement} <span style={styles.heroUnit}>mins</span></div>
            <div style={styles.heroMetricHint}>Running, exercise, sports &amp; swimming &mdash; last 7 entries.</div>
          </div>
          <div style={styles.heroCard}>
            <div style={styles.heroMetricLabel}>Recovery score</div>
            <div style={styles.heroMetricValue}>
              {coachPayload?.summary?.recoveryScore ?? '--'}
              <span style={styles.heroUnit}>/100</span>
            </div>
            <div style={styles.heroMetricHint}>Hydration + headache + meditation + food quality.</div>
          </div>
          <div style={styles.heroCard}>
            <div style={styles.heroMetricLabel}>Trek readiness</div>
            <div style={styles.heroMetricValue}>
              {coachPayload?.summary?.travelReadiness ?? '--'}
              <span style={styles.heroUnit}>/100</span>
            </div>
            <div style={styles.heroMetricHint}>How ready your body is for Hampta Pass or Norway.</div>
          </div>
        </div>

        <div style={styles.layout} className="wellness-layout">

          {/* ── LEFT COLUMN ── */}
          <div style={styles.leftColumn}>

            {/* Astra robot card */}
            <div style={styles.robotCard}>
              <div style={styles.robotHeaderRow}>
                <div>
                  <div style={styles.robotTitle}>&#x1F916; Astra</div>
                  <div style={styles.robotHint}>
                    Drag me around &middot; Double-tap to repeat &middot; I&apos;ll check in if you go quiet
                  </div>
                </div>
                <div style={styles.voiceBadge} title="Active voice">{voiceStatus}</div>
              </div>

              {/* Robot stage */}
              <div ref={robotStageRef} style={styles.robotStage} className="wellness-stage">
                <div
                  style={{ ...styles.robotAvatar, left: robotPos.x, top: robotPos.y }}
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    dragStateRef.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
                  }}
                  onDoubleClick={() => {
                    const line = coachPayload?.coachReply || 'Keep going yaar! You are doing amazing!';
                    pushChat('astra', line);
                    speakCoach(line);
                  }}
                >
                  <div style={styles.robotHead} className={isSpeaking ? 'astra-speaking' : ''}>
                    <div style={styles.robotEye} className="astra-eye" />
                    <div style={styles.robotEye} className="astra-eye" />
                  </div>
                  <div style={styles.robotBody}>
                    <div style={{ ...styles.robotCore, ...(isSpeaking ? { boxShadow: '0 0 32px rgba(244,114,182,0.9)' } : {}) }} />
                  </div>
                </div>

                {/* Speech bubble */}
                <div style={styles.speechBubble}>
                  <div style={styles.speechLabel}>{isSpeaking ? '&#x1F50A; Speaking...' : 'Astra says'}</div>
                  <div style={styles.speechText}>
                    {coachPayload?.coachReply || "Tell me about your day, yaar. I'll give you a proper plan!"}
                  </div>
                </div>
              </div>

              {/* Subtitle bar */}
              {subtitle ? (
                <div style={styles.subtitleBar}>
                  <span style={styles.subtitleText}>{subtitle}</span>
                </div>
              ) : null}

              {/* Controls */}
              <div style={styles.robotControls}>
                <button onClick={startVoiceInput} style={listening ? styles.micButtonActive : styles.micButton}>
                  {listening ? '&#x1F399; Listening...' : '&#x1F399; Use mic'}
                </button>
                <button
                  onClick={() => { const line = coachPayload?.coachReply || 'Keep going yaar. You are doing great!'; speakCoach(line); }}
                  style={styles.primaryButton}
                >
                  &#x1F50A; Speak advice
                </button>
              </div>

              {/* Voice transcript */}
              {transcript ? (
                <div style={styles.voiceTranscriptCard}>
                  <div style={styles.voiceTranscriptTitle}>You said</div>
                  <div style={styles.voiceTranscriptText}>{transcript}</div>
                </div>
              ) : null}
            </div>

            {/* Chat history */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>&#x1F4AC; Conversation with Astra</div>
              <div style={styles.chatScroll} className="wellness-chat">
                {chatHistory.length === 0 ? (
                  <div style={styles.chatEmpty}>No messages yet &mdash; Astra will say hi soon!</div>
                ) : (
                  chatHistory.map((msg) => (
                    <div key={msg.ts} style={msg.role === 'astra' ? styles.chatBubbleAstra : styles.chatBubbleUser}>
                      <div style={styles.chatRole}>{msg.role === 'astra' ? '&#x1F916; Astra' : '&#x1F464; You'}</div>
                      <div>{msg.text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Trek goals */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>&#x1F3D4; Trek &amp; Travel Goals</div>
              <div style={styles.goalList}>
                {goals.map((goal) => {
                  const insight = coachPayload?.goalInsights?.find((item) => item.id === goal.id);
                  return (
                    <div key={goal.id} style={styles.goalCard}>
                      <div style={styles.goalTop}>
                        <div>
                          <div style={styles.goalTitle}>{goal.title}</div>
                          <div style={styles.goalMeta}>{goal.location} &middot; {goal.targetMonth}</div>
                        </div>
                        <div style={styles.goalBudget}>{goal.budgetLabel || formatCurrency(goal.budget)}</div>
                      </div>
                      <div style={styles.goalVibe}>{goal.vibe}</div>
                      <div style={styles.goalProgress}>Readiness {insight?.readiness ?? 0}/100</div>
                      <div style={styles.goalAction}>{insight?.nextAction || 'Keep feeding Astra daily.'}</div>
                      {insight?.monthlyBudgetLabel && (
                        <div style={styles.goalBudgetHint}>Monthly target: {insight.monthlyBudgetLabel}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={styles.rightColumn}>

            {/* Activity form */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>&#x1F4CB; Today&apos;s Activity</div>
              <div style={styles.formGrid} className="wellness-form-grid">
                {ACTIVITY_FIELDS.map((field) => (
                  <label key={field.key} style={{ ...styles.metricInputCard, borderColor: field.color + '55' }}>
                    <span style={styles.metricInputLabel}>{field.label}</span>
                    <input
                      type="number" min="0" step={field.step || 1}
                      value={form[field.key]}
                      onChange={(e) => { setForm((c) => ({ ...c, [field.key]: Number(e.target.value || 0) })); resetNudgeTimer(); }}
                      style={styles.input}
                    />
                    <span style={styles.metricInputUnit}>{field.unit}</span>
                  </label>
                ))}
                <label style={styles.metricInputCard}>
                  <span style={styles.metricInputLabel}>Mood</span>
                  <input
                    type="number" min="1" max="10"
                    value={form.moodScore}
                    onChange={(e) => { setForm((c) => ({ ...c, moodScore: Number(e.target.value || 0) })); resetNudgeTimer(); }}
                    style={styles.input}
                  />
                  <span style={styles.metricInputUnit}>/10</span>
                </label>
                <label style={{ ...styles.metricInputCard, gridColumn: '1 / -1' }}>
                  <span style={styles.metricInputLabel}>Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => { setForm((c) => ({ ...c, notes: e.target.value })); resetNudgeTimer(); }}
                    style={styles.textarea}
                    placeholder="How was your body, food, focus, and mood today?"
                  />
                </label>
              </div>

              <div style={styles.promptRow}>
                <input
                  type="text"
                  value={coachPrompt}
                  onChange={(e) => { setCoachPrompt(e.target.value); resetNudgeTimer(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAskCoach(); }}
                  style={styles.input}
                  placeholder="Ask Astra something specific... (Enter to send)"
                />
                <button onClick={handleAskCoach} style={styles.secondaryButton} disabled={saving}>Ask</button>
              </div>

              <div style={styles.formActions}>
                <button onClick={handleSaveEntry} style={styles.primaryButton} disabled={saving}>
                  {saving ? 'Saving...' : '&#x1F4BE; Save day + get advice'}
                </button>
                <button
                  onClick={() => {
                    setForm({ ...DEFAULT_FORM, date: new Date().toISOString().slice(0, 10) });
                    setTranscript('');
                    localStorage.setItem(STORAGE_LAST_FORM_KEY, JSON.stringify(DEFAULT_FORM));
                  }}
                  style={styles.secondaryButton}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Recommendations */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>&#x2728; Astra&apos;s Recommendations</div>
              <div style={styles.recommendationGrid}>
                {(coachPayload?.suggestions || []).map((s) => (
                  <div
                    key={s.title}
                    style={{ ...styles.recommendationCard, cursor: 'pointer' }}
                    onClick={() => speakCoach(`${s.title}. ${s.detail}`)}
                    title="Tap to hear"
                  >
                    <div style={styles.recommendationTitle}>{s.title} &#x1F50A;</div>
                    <div style={styles.recommendationBody}>{s.detail}</div>
                    <div style={styles.recommendationPriority}>Priority: {s.priority}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent logs */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>&#x1F4C5; Recent Logs</div>
              <div style={styles.timelineList}>
                {(entries.length ? entries : [form]).slice(0, 6).map((entry) => (
                  <div key={entry.date} style={styles.timelineRow}>
                    <div style={styles.timelineDate}>{entry.date}</div>
                    <div style={styles.timelineSummary}>
                      {Number(entry.runningMinutes || 0) + Number(entry.exerciseMinutes || 0) + Number(entry.badmintonMinutes || 0) + Number(entry.cricketMinutes || 0) + Number(entry.footballMinutes || 0) + Number(entry.swimmingMinutes || 0)}&nbsp;mins active &middot; headache {entry.headacheLevel}/10 &middot; mood {entry.moodScore}/10
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

// ── Keyframe strings ──────────────────────────────────────────
const loadingKeyframes = `
  @keyframes floaty {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-12px); }
  }
`;

const pageKeyframes = `
  @keyframes floaty {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-10px); }
  }
  @keyframes blink {
    0%,90%,100% { opacity: 1; }
    95%          { opacity: 0; }
  }
  @keyframes pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(251,191,36,0.7); }
    100% { box-shadow: 0 0 0 22px rgba(251,191,36,0); }
  }
  @keyframes subtitleIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cloudDrift {
    0%   { transform: translateX(-5%); }
    100% { transform: translateX(5%); }
  }
  @keyframes starTwinkle {
    0%,100% { opacity: 0.35; }
    50%      { opacity: 1; }
  }
  @keyframes sunRise {
    0%   { transform: translate(-50%,-50%) scale(0.7); opacity: 0.5; }
    100% { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
  }
  .astra-eye      { animation: blink 4s ease-in-out infinite; }
  .astra-speaking { animation: pulse-ring 1.2s ease-out infinite; }
  @media (max-width: 900px) {
    .wellness-layout    { grid-template-columns: 1fr !important; }
    .wellness-form-grid { grid-template-columns: 1fr 1fr !important; }
    .wellness-hero      { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 600px) {
    .wellness-page      { padding: 12px !important; }
    .wellness-form-grid { grid-template-columns: 1fr 1fr !important; }
    .wellness-stage     { height: 220px !important; }
    .wellness-hero      { grid-template-columns: 1fr !important; }
    .wellness-chat      { max-height: 220px !important; }
  }
`;

// ── Styles ────────────────────────────────────────────────────
const styles = {
  mountainBgFixed: {
    position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none',
  },
  mountainSky: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, #0f0721 0%, #1e1b4b 18%, #312e81 32%, #1d4ed8 48%, #0369a1 60%, #f97316 74%, #fbbf24 84%, #fef3c7 100%)',
  },
  starField: {
    position: 'absolute', inset: 0,
    backgroundImage: [
      'radial-gradient(1px 1px at 5% 6%,   rgba(255,255,255,0.9) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 12% 3%,  rgba(255,255,255,0.7) 0%, transparent 100%)',
      'radial-gradient(1.5px 1.5px at 20% 8%, rgba(255,255,255,0.85) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 28% 4%,  rgba(255,255,255,0.6) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 38% 9%,  rgba(255,255,255,0.8) 0%, transparent 100%)',
      'radial-gradient(1.5px 1.5px at 47% 2%, rgba(255,255,255,0.9) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 57% 7%,  rgba(255,255,255,0.7) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 66% 4%,  rgba(255,255,255,0.8) 0%, transparent 100%)',
      'radial-gradient(1.5px 1.5px at 75% 10%, rgba(255,255,255,0.85) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 83% 5%,  rgba(255,255,255,0.6) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 91% 2%,  rgba(255,255,255,0.75) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 96% 8%,  rgba(255,255,255,0.7) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 9% 14%,  rgba(255,255,255,0.5) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 43% 16%, rgba(255,255,255,0.6) 0%, transparent 100%)',
      'radial-gradient(1px 1px at 71% 14%, rgba(255,255,255,0.55) 0%, transparent 100%)',
    ].join(', '),
    animation: 'starTwinkle 4s ease-in-out infinite alternate',
  },
  sunGlow: {
    position: 'absolute', top: '62%', left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '200px', height: '90px',
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(251,191,36,0.55) 0%, rgba(249,115,22,0.3) 40%, transparent 70%)',
    animation: 'sunRise 3s ease-out forwards',
    filter: 'blur(5px)',
  },
  mountainSvgLayer: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
  },
  loading: {
    position: 'relative', minHeight: '100vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
  },
  loadingDot: {
    width: '48px', height: '48px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #38bdf8, #ec4899)',
    animation: 'floaty 1.4s ease-in-out infinite',
    boxShadow: '0 0 32px rgba(56,189,248,0.6)',
  },
  page: {
    position: 'relative', zIndex: 1, minHeight: '100vh',
    padding: '20px', color: '#f8fafc',
    fontFamily: '"Inter","Segoe UI",system-ui,sans-serif', boxSizing: 'border-box',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: '14px', flexWrap: 'wrap', marginBottom: '14px',
  },
  eyebrow: {
    color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.12em',
    fontSize: '11px', marginBottom: '6px', fontWeight: 700,
  },
  title: {
    margin: 0, fontSize: 'clamp(22px,5vw,34px)', fontWeight: 900, lineHeight: 1.1,
    color: '#f8fafc', textShadow: '0 2px 14px rgba(0,0,0,0.55)',
  },
  subtitle: {
    marginTop: '8px', fontSize: '14px', lineHeight: 1.6,
    maxWidth: '680px', color: 'rgba(248,250,252,0.72)',
  },
  weatherWidget: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 18px', borderRadius: '20px',
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.22)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
  },
  weatherTemp: { fontWeight: 900, fontSize: '22px', color: '#f8fafc', lineHeight: 1 },
  weatherCity: { fontWeight: 700, fontSize: '12px', color: 'rgba(248,250,252,0.88)', marginTop: '3px' },
  weatherDesc: { fontSize: '11px', color: 'rgba(248,250,252,0.6)', marginTop: '2px' },
  quoteCard: {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '14px 18px', borderRadius: '18px', marginBottom: '14px',
    background: 'rgba(255,255,255,0.09)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.16)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
  },
  quoteIcon:   { fontSize: '30px', flexShrink: 0, marginTop: '2px' },
  quoteText:   { fontSize: '14px', fontStyle: 'italic', color: 'rgba(248,250,252,0.9)', lineHeight: 1.65, fontWeight: 500 },
  quoteAuthor: { marginTop: '6px', fontSize: '12px', color: '#fbbf24', fontWeight: 700 },
  heroGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
    gap: '12px', marginBottom: '14px',
  },
  heroCard: {
    borderRadius: '20px', padding: '16px',
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(14px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
    border: '1px solid rgba(255,255,255,0.16)',
  },
  heroMetricLabel: {
    fontSize: '11px', textTransform: 'uppercase',
    letterSpacing: '0.06em', color: 'rgba(248,250,252,0.62)', fontWeight: 600,
  },
  heroMetricValue: { fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900, marginTop: '8px', color: '#f8fafc' },
  heroUnit:        { fontSize: '14px', fontWeight: 400, color: 'rgba(248,250,252,0.55)' },
  heroMetricHint:  { marginTop: '6px', color: 'rgba(248,250,252,0.55)', lineHeight: 1.5, fontSize: '12px' },
  layout: {
    display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: '16px', alignItems: 'start',
  },
  leftColumn:  { display: 'grid', gap: '14px' },
  rightColumn: { display: 'grid', gap: '14px' },
  card: {
    background: 'rgba(15,23,42,0.62)',
    backdropFilter: 'blur(18px)',
    border: '1px solid rgba(255,255,255,0.11)',
    borderRadius: '22px', padding: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.28)', color: '#f8fafc',
  },
  robotCard: {
    background: 'rgba(14,165,233,0.13)',
    backdropFilter: 'blur(18px)',
    border: '1px solid rgba(56,189,248,0.28)',
    borderRadius: '26px', padding: '16px',
    boxShadow: '0 8px 40px rgba(14,165,233,0.22)', color: '#f8fafc',
  },
  robotHeaderRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px',
  },
  robotTitle: { fontWeight: 900, fontSize: '22px', color: '#e0f2fe' },
  robotHint:  { marginTop: '4px', fontSize: '11px', color: 'rgba(224,242,254,0.65)', lineHeight: 1.5 },
  voiceBadge: {
    padding: '5px 10px', borderRadius: '999px',
    background: 'rgba(56,189,248,0.16)', color: '#bae6fd',
    fontSize: '10px', fontWeight: 700, border: '1px solid rgba(56,189,248,0.28)',
    maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  robotStage: {
    position: 'relative', height: '280px', borderRadius: '22px', overflow: 'hidden',
    background: 'linear-gradient(180deg,rgba(30,27,75,0.65) 0%,rgba(14,165,233,0.12) 100%)',
    border: '1px solid rgba(56,189,248,0.18)',
  },
  robotAvatar: {
    position: 'absolute', width: '110px', height: '140px',
    cursor: 'grab', userSelect: 'none', touchAction: 'none',
    animation: 'floaty 3.4s ease-in-out infinite',
  },
  robotHead: {
    width: '100px', height: '74px', borderRadius: '24px',
    background: 'linear-gradient(160deg,#1e293b,#0f172a)',
    border: '3px solid #38bdf8',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px',
    margin: '0 auto', boxShadow: '0 8px 30px rgba(56,189,248,0.35)',
  },
  robotEye: {
    width: '13px', height: '13px', borderRadius: '50%',
    background: '#38bdf8', boxShadow: '0 0 10px rgba(56,189,248,0.9)',
  },
  robotBody: {
    width: '78px', height: '56px', margin: '-4px auto 0', borderRadius: '20px',
    background: 'linear-gradient(180deg,#075985,#0c4a6e)', border: '3px solid #0ea5e9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  robotCore: {
    width: '22px', height: '22px', borderRadius: '50%',
    background: 'linear-gradient(180deg,#f472b6,#ec4899)',
    boxShadow: '0 0 18px rgba(244,114,182,0.65)', transition: 'box-shadow 0.3s',
  },
  speechBubble: {
    position: 'absolute', right: '12px', top: '14px',
    width: 'min(210px,56%)', padding: '12px',
    borderRadius: '16px 16px 16px 4px',
    background: 'rgba(15,23,42,0.88)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(56,189,248,0.28)',
    boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
  },
  speechLabel: { fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px', fontWeight: 700 },
  speechText:  { color: '#e2e8f0', fontSize: '12px', lineHeight: 1.55, maxHeight: '160px', overflow: 'hidden' },
  subtitleBar: {
    marginTop: '10px', padding: '10px 14px', borderRadius: '14px',
    background: 'rgba(14,165,233,0.14)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(56,189,248,0.24)',
    animation: 'subtitleIn 0.2s ease',
  },
  subtitleText: { fontSize: '15px', fontWeight: 700, color: '#bae6fd', letterSpacing: '0.01em' },
  robotControls: { display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' },
  micButton: {
    flex: 1, background: 'linear-gradient(135deg,#0369a1,#0891b2)',
    border: 'none', color: '#fff', fontWeight: 800,
    padding: '14px 16px', borderRadius: '999px', cursor: 'pointer',
    fontSize: '14px', minWidth: '120px', boxShadow: '0 4px 12px rgba(3,105,161,0.45)',
  },
  micButtonActive: {
    flex: 1, background: 'linear-gradient(135deg,#be123c,#e11d48)',
    border: 'none', color: '#fff', fontWeight: 800,
    padding: '14px 16px', borderRadius: '999px', cursor: 'pointer',
    fontSize: '14px', minWidth: '120px', boxShadow: '0 4px 12px rgba(190,18,60,0.45)',
    animation: 'pulse-ring 1s ease-out infinite',
  },
  primaryButton: {
    background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
    color: '#f8fafc', border: 'none', borderRadius: '999px',
    padding: '14px 20px', fontWeight: 800, cursor: 'pointer', fontSize: '14px',
    boxShadow: '0 4px 14px rgba(124,58,237,0.45)',
  },
  secondaryButton: {
    background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
    color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '999px', padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '14px',
  },
  voiceTranscriptCard: {
    marginTop: '12px', padding: '12px', borderRadius: '16px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(56,189,248,0.14)',
  },
  voiceTranscriptTitle: { fontWeight: 700, marginBottom: '4px', fontSize: '12px', color: 'rgba(248,250,252,0.55)' },
  voiceTranscriptText:  { color: '#e2e8f0', fontSize: '13px', lineHeight: 1.55 },
  chatScroll: {
    maxHeight: '280px', overflowY: 'auto', display: 'flex',
    flexDirection: 'column', gap: '10px', paddingRight: '4px',
  },
  chatEmpty:      { color: 'rgba(248,250,252,0.38)', fontSize: '13px', textAlign: 'center', padding: '20px 0' },
  chatBubbleAstra: {
    padding: '10px 14px', borderRadius: '18px 18px 18px 4px',
    background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.2)',
    fontSize: '13px', lineHeight: 1.55, maxWidth: '92%', color: '#e0f2fe',
  },
  chatBubbleUser: {
    padding: '10px 14px', borderRadius: '18px 18px 4px 18px',
    background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.22)',
    fontSize: '13px', lineHeight: 1.55, alignSelf: 'flex-end', maxWidth: '92%', color: '#e9d5ff',
  },
  chatRole:  { fontSize: '11px', fontWeight: 700, color: 'rgba(248,250,252,0.48)', marginBottom: '4px' },
  cardTitle: { fontSize: '17px', fontWeight: 800, marginBottom: '12px', color: '#f8fafc' },
  formGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
    gap: '10px', marginBottom: '10px',
  },
  metricInputCard: {
    display: 'flex', flexDirection: 'column', gap: '5px',
    padding: '10px', borderRadius: '16px',
    border: '1.5px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
  },
  metricInputLabel: { fontSize: '11px', fontWeight: 700, color: 'rgba(248,250,252,0.78)' },
  metricInputUnit:  { fontSize: '10px', color: 'rgba(248,250,252,0.42)' },
  input: {
    width: '100%', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.08)',
    padding: '10px 12px', fontSize: '14px',
    color: '#f8fafc', boxSizing: 'border-box', outline: 'none',
  },
  textarea: {
    width: '100%', minHeight: '80px', borderRadius: '14px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.08)',
    padding: '10px 12px', fontSize: '14px',
    color: '#f8fafc', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  promptRow:   { display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginTop: '12px' },
  formActions: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' },
  recommendationGrid: { display: 'grid', gap: '10px' },
  recommendationCard: {
    borderRadius: '16px', padding: '12px',
    background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.22)',
  },
  recommendationTitle:    { fontWeight: 800, marginBottom: '5px', fontSize: '14px', color: '#e9d5ff' },
  recommendationBody:     { color: 'rgba(248,250,252,0.68)', fontSize: '13px', lineHeight: 1.55 },
  recommendationPriority: { marginTop: '7px', color: '#c084fc', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 },
  goalList: { display: 'grid', gap: '10px' },
  goalCard: {
    borderRadius: '18px', padding: '12px',
    background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.22)',
  },
  goalTop:        { display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' },
  goalTitle:      { fontWeight: 800, fontSize: '14px', color: '#fef3c7' },
  goalMeta:       { fontSize: '12px', color: 'rgba(248,250,252,0.52)', marginTop: '3px' },
  goalBudget:     { fontWeight: 800, color: '#fbbf24', fontSize: '14px' },
  goalVibe:       { marginTop: '8px', color: 'rgba(248,250,252,0.68)', fontSize: '12px' },
  goalProgress:   { marginTop: '8px', fontWeight: 700, color: '#34d399', fontSize: '13px' },
  goalAction:     { marginTop: '6px', color: 'rgba(248,250,252,0.62)', fontSize: '12px', lineHeight: 1.5 },
  goalBudgetHint: { marginTop: '6px', color: '#fde68a', fontSize: '12px', fontWeight: 700 },
  timelineList: { display: 'grid', gap: '8px' },
  timelineRow: {
    padding: '10px 12px', borderRadius: '14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  },
  timelineDate:    { fontWeight: 800, marginBottom: '3px', fontSize: '13px', color: '#f8fafc' },
  timelineSummary: { color: 'rgba(248,250,252,0.52)', fontSize: '12px', lineHeight: 1.45 },
};
