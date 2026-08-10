import { useEffect, useId, useMemo, useState } from 'react';
import { buildQuickGuideFromEngine, parseMarkdownSections } from './advancedCoachEngine';

function BodyReadinessMeter({ readiness, fallbackPct = 70, gradId }) {
  const percent = Math.max(
    0,
    Math.min(100, Math.round(Number(readiness?.percent ?? fallbackPct) || 70)),
  );
  const label = readiness?.label || (percent >= 85 ? 'Ready' : percent >= 65 ? 'Good' : 'Recovering');
  const color = readiness?.color || '#34d399';
  const why = readiness?.why || 'How ready your body is to train hard today.';
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - percent / 100);

  return (
    <div
      className="coach-ready"
      style={{ '--ready-color': color }}
      aria-label={`Body readiness ${percent} percent — ${label}`}
    >
      <div className="coach-ready-ring-wrap">
        <svg className="coach-ready-ring" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="55%" stopColor={color} />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.85" />
            </linearGradient>
            <filter id={`${gradId}-glow`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
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
          <strong className="coach-ready-num">{percent}</strong>
          <span className="coach-ready-unit">%</span>
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
  'What should I eat before my 6am run?',
  'How do I improve speed safely?',
  'My HR spikes mid-run — what do I do?',
  'How do I stay in fat-burning zone?',
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

  const run = async (prompt) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/coach/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ask: prompt || ask,
          tip,
          runRows: serializeRuns(runRows),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Coach request failed');
      applyResult(data);
    } catch (err) {
      setError(err.message || 'Could not load advanced coach');
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
    if (!runRows?.length) return undefined;
    let cancelled = false;
    setLoading(true);
    fetch('/api/coach/advanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask: '', tip, runRows: serializeRuns(runRows) }),
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
          placeholder="Ask anything — food, speed, HR spikes…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) run(ask);
          }}
        />
        <button type="button" className="coach-ask-btn" disabled={loading} onClick={() => run(ask)}>
          {loading ? 'Thinking…' : 'Guide me'}
        </button>
      </div>
      {error ? <div className="coach-advanced-error">{error}</div> : null}
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
