import { useEffect, useId, useMemo, useState } from 'react';
import { buildQuickGuideFromEngine, parseMarkdownSections } from './advancedCoachEngine';

function ConfidenceBeam({ value = 0.8, gradId }) {
  const pct = Math.max(0.08, Math.min(1, Number(value) || 0.8));
  return (
    <div className="coach-beam" aria-label={`Confidence ${Math.round(pct * 100)} percent`}>
      <div className="coach-beam-meta">
        <span>Signal confidence</span>
        <strong>{Math.round(pct * 100)}%</strong>
      </div>
      <div className="coach-beam-track">
        <div className="coach-beam-fill" style={{ width: `${pct * 100}%` }}>
          <span className="coach-beam-glow" />
        </div>
      </div>
      <svg className="coach-beam-wave" viewBox="0 0 240 28" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5eead4" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path
          d="M0 18 C24 8, 40 26, 64 14 S104 4, 128 16 S168 28, 192 12 S224 6, 240 16"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          className="coach-beam-path"
        />
      </svg>
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
    // tipAction/tipKey/runSig keep seed fetch stable without re-hitting on every tip object identity change
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
  const accent = theme?.cyan || theme?.blue || '#38bdf8';

  const quick = useMemo(
    () => buildQuickGuideFromEngine({ runRows, tip }),
    [runRows, tip],
  );

  if (!tip && !quick?.tip) return null;

  const title = quick?.title || tip?.title || 'Cosmix Coach';
  const body = quick?.tip || tip?.tip || '';
  const action = quick?.action || tip?.action;
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
      style={{ '--coach-accent': accent }}
      aria-label="Cosmix Coach recommendation"
    >
      <div className="coach-brief-aurora" aria-hidden="true">
        <span className="coach-brief-blob coach-brief-blob-a" />
        <span className="coach-brief-blob coach-brief-blob-b" />
        <span className="coach-brief-sheen" />
      </div>

      <div className="coach-brief-top">
        <div className="coach-brief-brand-block">
          <div className="coach-brief-status">
            <span className="coach-brief-status-dot" />
            Data engine · live
          </div>
          <div className="coach-brief-brand">Cosmix Coach</div>
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
            <p className="coach-brief-kicker">Quick guide · data engine</p>
            <h2 className="coach-brief-title">{title}</h2>
            <p className="coach-brief-tip">{body}</p>
            {action ? (
              <div className="coach-brief-cta coach-brief-cta-inline">
                <span>Execute</span>
                <strong>{action}</strong>
              </div>
            ) : null}
            <ConfidenceBeam value={quick?.confidence || tip?.confidence || 0.84} gradId={gradId} />
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
              <span>Protocol stack</span>
              <span>{protocols.length} steps</span>
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
