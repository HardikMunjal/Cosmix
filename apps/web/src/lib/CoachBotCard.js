import { useEffect, useId, useMemo, useState } from 'react';
import { buildQuickGuideFromEngine, buildAdvancedCoachPayload, parseMarkdownSections, localAdvancedReply } from './advancedCoachEngine';

function readinessTone(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const stops = [
    { at: 28, color: '#fb7185' },
    { at: 48, color: '#fb923c' },
    { at: 58, color: '#fbbf24' },
    { at: 68, color: '#38bdf8' },
    { at: 78, color: '#2dd4bf' },
    { at: 88, color: '#34d399' },
    { at: 98, color: '#22c55e' },
  ];
  if (p <= stops[0].at) return stops[0].color;
  if (p >= stops[stops.length - 1].at) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (p >= a.at && p <= b.at) {
      const t = (p - a.at) / (b.at - a.at);
      const parse = (hex) => {
        const h = hex.slice(1);
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      };
      const [ar, ag, ab] = parse(a.color);
      const [br, bg, bb] = parse(b.color);
      const toHex = (n) => n.toString(16).padStart(2, '0');
      return `#${toHex(Math.round(ar + (br - ar) * t))}${toHex(Math.round(ag + (bg - ag) * t))}${toHex(Math.round(ab + (bb - ab) * t))}`;
    }
  }
  return stops[stops.length - 1].color;
}

function readinessLabel(percent) {
  if (percent >= 88) return 'Prime';
  if (percent >= 78) return 'Ready';
  if (percent >= 65) return 'Good';
  if (percent >= 50) return 'Recovering';
  return 'Rest first';
}

function BodyReadinessMeter({ readiness, fallbackPct = 70, gradId }) {
  const percent = Math.max(
    0,
    Math.min(100, Math.round(Number(readiness?.percent ?? fallbackPct) || 70)),
  );
  const label = readiness?.label || readinessLabel(percent);
  const color = readiness?.color || readinessTone(percent);
  const glow = readinessTone(Math.min(100, percent + 8));
  const why = readiness?.why || 'How ready your body is to train hard today.';
  const radius = 46;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - percent / 100);

  return (
    <div
      className="coach-ready"
      style={{ '--ready-color': color, '--ready-glow': glow }}
      aria-label={`Body readiness ${percent} percent — ${label}`}
    >
      <div className="coach-ready-ring-wrap">
        <svg className="coach-ready-ring" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.45" />
              <stop offset="55%" stopColor={color} />
              <stop offset="100%" stopColor={glow} />
            </linearGradient>
            <filter id={`${gradId}-glow`} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle className="coach-ready-track" cx="60" cy="60" r={radius} />
          <circle
            className="coach-ready-progress"
            cx="60"
            cy="60"
            r={radius}
            stroke={`url(#${gradId})`}
            filter={`url(#${gradId}-glow)`}
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="coach-ready-core">
          <div className="coach-ready-score">
            <strong className="coach-ready-num">{percent}</strong>
            <span className="coach-ready-unit">%</span>
          </div>
        </div>
      </div>
      <div className="coach-ready-copy">
        <div className="coach-ready-meta">
          <span className="coach-ready-kicker">Body readiness</span>
          <span className="coach-ready-badge">{label}</span>
        </div>
        <p className="coach-ready-why">{why}</p>
      </div>
    </div>
  );
}

function ProtocolStep({ index, label, value }) {
  if (!value) return null;
  return (
    <li className="coach-step">
      <div className="coach-step-index">{String(index).padStart(2, '0')}</div>
      <div className="coach-step-copy">
        <div className="coach-step-label">{label}</div>
        <div className="coach-step-value">{value}</div>
      </div>
    </li>
  );
}

const ASK_CHIPS = [
  'How was my last run? How can I improve?',
  'When should I slow down vs push pace?',
  'What should I eat before my 6am run?',
  'My HR spikes mid-run — what do I do?',
];

function serializeRuns(runRows = []) {
  return (runRows || []).slice(0, 60).map((r) => ({
    date: r.date,
    distance: r.distance,
    minutes: r.minutes,
    avgHeartrate: r.avgHeartrate || r.avgHeartRate || null,
    maxHeartrate: r.maxHeartrate || r.maxHeartRate || null,
    startTime: r.startTime || r.date,
    bestSplitPaceMinPerKm: r.bestSplitPaceMinPerKm || null,
  }));
}

function CoachSections({ sections = [], provider, summary, headline }) {
  if (!sections.length) return null;
  return (
    <div className="coach-advanced-result">
      <div className="coach-advanced-provider">
        {provider === 'local' || !provider ? 'Cosmix data engine' : `LLM · ${provider}`}
        {summary?.typicalHour != null ? ` · typical start ~${String(summary.typicalHour).padStart(2, '0')}:00` : ''}
        {summary?.runs30 != null ? ` · ${summary.runs30} runs/30d` : ''}
      </div>
      {headline ? <div className="coach-advanced-headline">{headline}</div> : null}
      <div className="coach-advanced-sections">
        {sections.map((section) => (
          <article key={section.id || section.title} className="coach-advanced-section">
            <h4>{section.title}</h4>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function AdvancedCoachPanel({ tip, runRows = [] }) {
  const [ask, setAsk] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const applyResult = (data) => {
    const parsed = (!data.sections?.length && data.reply)
      ? parseMarkdownSections(data.reply)
      : [];
    setResult({
      ...data,
      sections: (data.sections && data.sections.length) ? data.sections : parsed,
    });
  };

  const runLocal = (prompt) => {
    const payload = buildAdvancedCoachPayload({
      runRows: serializeRuns(runRows),
      ask: prompt,
      tip,
    });
    applyResult({
      ...payload,
      provider: 'local',
      reply: localAdvancedReply(payload),
    });
  };

  const run = async (prompt) => {
    const question = String(prompt || ask || '').trim()
      || 'How was my last run and how can I improve?';
    setAsk(question);
    setLoading(true);
    setError('');
    runLocal(question);
    try {
      const res = await fetch('/api/coach/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ask: question,
          tip,
          runRows: serializeRuns(runRows),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Coach request failed');
      applyResult(data);
    } catch (err) {
      setError(err.message || 'Could not reach coach API — showing local analysis.');
    } finally {
      setLoading(false);
    }
  };

  const tipAction = tip?.action || '';
  const tipKey = tip?.title || '';
  const runSig = useMemo(
    () => serializeRuns(runRows).map((r) => `${r.date}|${r.distance}|${r.avgHeartrate || ''}`).join(';'),
    [runRows],
  );

  useEffect(() => {
    if (!runRows?.length) {
      runLocal('How was my last run and how can I improve?');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const question = 'How was my last run and how can I improve?';
    runLocal(question);
    fetch('/api/coach/advanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask: question, tip, runRows: serializeRuns(runRows) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) applyResult(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [runSig, tipAction, tipKey]);

  return (
    <div className="coach-advanced">
      <div className="coach-advanced-intro">
        Built from your run history (start time, pace, HR, splits, volume). Cards only — no raw markdown.
      </div>
      <div className="coach-advanced-chips">
        {ASK_CHIPS.map((chip) => (
          <button key={chip} type="button" className="coach-chip" onClick={() => { setAsk(chip); run(chip); }}>
            {chip}
          </button>
        ))}
      </div>
      <div className="coach-ask-row">
        <input
          className="coach-ask-input"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ask anything — last run, pace, HR, food…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) run(ask);
          }}
        />
        <button type="button" className="coach-ask-btn" disabled={loading} onClick={() => run(ask)}>
          {loading ? 'Thinking…' : 'Guide me'}
        </button>
      </div>
      {error ? <div className="coach-advanced-error">{error}</div> : null}
      {loading && !(result?.sections?.length) ? (
        <div className="coach-advanced-intro">Analyzing your runs…</div>
      ) : null}
      <CoachSections
        sections={result?.sections || []}
        provider={result?.provider}
        summary={result?.summary}
        headline={result?.headline}
      />
    </div>
  );
}

export function CoachBotCard({ tip, theme, runRows = [] }) {
  const [mode, setMode] = useState('quick');
  const gradId = useId().replace(/:/g, '');
  const accent = theme?.cyan || theme?.blue || '#22d3ee';

  const quick = useMemo(
    () => buildQuickGuideFromEngine({ runRows, tip }),
    [runRows, tip],
  );

  if (!tip && !quick?.tip) return null;

  const title = quick?.title || tip?.title || 'Cosmix Coach';
  const body = quick?.tip || tip?.tip || '';
  const action = quick?.action || tip?.action;
  const readiness = tip?.bodyReadiness || quick?.bodyReadiness || null;
  const readyPct = readiness?.percent
    ?? Math.round((quick?.confidence || tip?.confidence || 0.7) * 100);
  const protocols = quick?.protocols?.length
    ? quick.protocols
    : [
      { label: 'When', value: tip?.nextWhen },
      { label: 'Fuel', value: tip?.fuel },
      { label: 'Hydration', value: tip?.hydration },
      { label: 'Sleep', value: tip?.sleep },
    ].filter((row) => row.value);
  const meta = quick?.metaChips || [];

  return (
    <section
      className="coach-brief"
      style={{ '--coach-accent': accent, '--ready-color': readiness?.color || '#34d399' }}
      aria-label="Cosmix Coach recommendation"
    >
      <div className="coach-brief-aurora" aria-hidden="true">
        <span className="coach-brief-blob coach-brief-blob-a" />
        <span className="coach-brief-blob coach-brief-blob-b" />
        <span className="coach-brief-mesh" />
        <span className="coach-brief-sheen" />
      </div>

      <div className="coach-brief-top">
        <div className="coach-brief-brand-block">
          <div className="coach-brief-status">
            <span className="coach-brief-status-dot" />
            Live readiness
          </div>
          <div className="coach-brief-brand">
            <span className="coach-brief-brand-3d">Cosmix</span>
            <span className="coach-brief-brand-sub">Coach</span>
          </div>
        </div>
        <div className="coach-mode-toggle" role="tablist" aria-label="Coach mode">
          <button type="button" className={mode === 'quick' ? 'is-active' : ''} onClick={() => setMode('quick')}>Quick</button>
          <button type="button" className={mode === 'advanced' ? 'is-active' : ''} onClick={() => setMode('advanced')}>Advanced</button>
        </div>
      </div>

      {mode === 'advanced' ? (
        <AdvancedCoachPanel tip={tip} runRows={runRows} />
      ) : (
        <div className="coach-brief-main">
          <div className="coach-brief-directive">
            <p className="coach-brief-kicker">Today&apos;s call</p>
            <h2 className="coach-brief-title coach-title-3d">{title}</h2>
            <p className="coach-brief-tip">{body}</p>
            {action ? (
              <div className="coach-brief-cta coach-brief-cta-inline">
                <span>Next move</span>
                <strong>{action}</strong>
              </div>
            ) : null}
            <BodyReadinessMeter
              readiness={readiness}
              fallbackPct={readyPct}
              gradId={`ready-${gradId}`}
            />
            {meta.length ? (
              <div className="coach-brief-stats">
                {meta.map((item) => (
                  <div key={item.k} className="coach-brief-stat">
                    <span>{item.k}</span>
                    <strong>{item.v}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="coach-brief-rail" aria-label="Recovery protocols">
            <div className="coach-brief-rail-head">
              <span>Protocol</span>
              <span>{protocols.length}</span>
            </div>
            <ol className="coach-step-list">
              {protocols.map((row, index) => (
                <ProtocolStep key={row.label} index={index + 1} label={row.label} value={row.value} />
              ))}
            </ol>
          </aside>
        </div>
      )}
    </section>
  );
}
