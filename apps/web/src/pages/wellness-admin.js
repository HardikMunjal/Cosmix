import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { DEFAULT_SCORING_RULES, normalizeScoringRules } from '../lib/wellnessScoring';

function isAdminUser(user) {
  const username = String(user?.username || '').trim().toLowerCase();
  const email = String(user?.email || '').trim().toLowerCase();
  return user?.id === 'usr-hardi' || username === 'hardi' || email === 'hardik.munjaal@gmail.com';
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function WellnessAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rules, setRules] = useState(DEFAULT_SCORING_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const API_BASE = typeof window !== 'undefined'
    ? ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${window.location.protocol}//${window.location.hostname}:3004`
      : '')
    : '';

  useEffect(() => {
    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!sessionUser) return;
      if (!isAdminUser(sessionUser)) {
        router.push('/wellness');
        return;
      }
      fetch(`${API_BASE}/wellness/scoring-rules`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data) setRules(normalizeScoringRules(data));
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          setMessage('Could not load scoring rules.');
        });
    });
  }, [API_BASE, router]);

  function updateActivityRule(key, field, value) {
    setRules((current) => ({
      ...current,
      activities: current.activities.map((rule) => (
        rule.key === key ? { ...rule, [field]: numberValue(value, rule[field]) } : rule
      )),
    }));
  }

  function updateSection(section, field, value) {
    setRules((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: numberValue(value, current[section][field]),
      },
    }));
  }

  function handleSave() {
    setSaving(true);
    setMessage('');
    fetch(`${API_BASE}/wellness/scoring-rules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setSaving(false);
        if (!data) {
          setMessage('Could not save scoring rules.');
          return;
        }
        setRules(normalizeScoringRules(data));
        setMessage('Scoring rules saved. Wellness scores will recalculate from these rules on reload.');
      })
      .catch(() => {
        setSaving(false);
        setMessage('Could not save scoring rules.');
      });
  }

  if (loading) {
    return <div style={styles.page}>Loading scoring admin...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Admin</div>
          <h1 style={styles.title}>Wellness Scoring Rules</h1>
        </div>
        <div style={styles.actions}>
          <button onClick={() => router.push('/wellness')} style={styles.secondaryBtn}>Back to Wellness</button>
          <button onClick={handleSave} disabled={saving} style={styles.primaryBtn}>{saving ? 'Saving...' : 'Save Rules'}</button>
        </div>
      </div>

      {message && <div style={styles.message}>{message}</div>}

      <div style={styles.card}>
        <div style={styles.cardTitle}>Daily drain</div>
        <div style={styles.grid2}>
          <label style={styles.field}><span>Physical</span><input type="number" step="0.1" value={rules.dailyPenalty.physical} onChange={(event) => updateSection('dailyPenalty', 'physical', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Mental</span><input type="number" step="0.1" value={rules.dailyPenalty.mental} onChange={(event) => updateSection('dailyPenalty', 'mental', event.target.value)} style={styles.input} /></label>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Sleep rule</div>
        <div style={styles.grid3}>
          <label style={styles.field}><span>Baseline hours</span><input type="number" step="0.1" value={rules.sleep.baselineHours} onChange={(event) => updateSection('sleep', 'baselineHours', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Step hours</span><input type="number" step="0.1" value={rules.sleep.stepHours} onChange={(event) => updateSection('sleep', 'stepHours', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Score per step</span><input type="number" step="0.1" value={rules.sleep.scorePerStep} onChange={(event) => updateSection('sleep', 'scorePerStep', event.target.value)} style={styles.input} /></label>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Readiness targets</div>
        <div style={styles.grid3}>
          <label style={styles.field}><span>Hampta Pass</span><input type="number" step="1" value={rules.targets.hamptaPass} onChange={(event) => updateSection('targets', 'hamptaPass', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Skiing 2027</span><input type="number" step="1" value={rules.targets.skiing2027} onChange={(event) => updateSection('targets', 'skiing2027', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Marathon 10k</span><input type="number" step="1" value={rules.targets.marathon10k} onChange={(event) => updateSection('targets', 'marathon10k', event.target.value)} style={styles.input} /></label>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Activity rules</div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Activity</th>
                <th style={styles.th}>Physical x</th>
                <th style={styles.th}>Physical /</th>
                <th style={styles.th}>Mental x</th>
                <th style={styles.th}>Mental /</th>
              </tr>
            </thead>
            <tbody>
              {rules.activities.map((rule) => (
                <tr key={rule.key}>
                  <td style={styles.td}>{rule.icon} {rule.label}</td>
                  <td style={styles.td}><input type="number" step="0.1" value={rule.physicalMultiplier} onChange={(event) => updateActivityRule(rule.key, 'physicalMultiplier', event.target.value)} style={styles.input} /></td>
                  <td style={styles.td}><input type="number" step="0.1" value={rule.physicalDivisor} onChange={(event) => updateActivityRule(rule.key, 'physicalDivisor', event.target.value)} style={styles.input} /></td>
                  <td style={styles.td}><input type="number" step="0.1" value={rule.mentalMultiplier} onChange={(event) => updateActivityRule(rule.key, 'mentalMultiplier', event.target.value)} style={styles.input} /></td>
                  <td style={styles.td}><input type="number" step="0.1" value={rule.mentalDivisor} onChange={(event) => updateActivityRule(rule.key, 'mentalDivisor', event.target.value)} style={styles.input} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#140f23', color: '#fff', padding: '24px', fontFamily: '"Segoe UI",system-ui,sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 },
  eyebrow: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.7, fontWeight: 700 },
  title: { margin: '6px 0 0', fontSize: 34, lineHeight: 1.1 },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { border: 'none', borderRadius: 12, padding: '10px 18px', background: 'linear-gradient(135deg,#fb7185,#f97316)', color: '#fff', fontWeight: 800, cursor: 'pointer' },
  secondaryBtn: { border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  message: { marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.08)' },
  card: { marginBottom: 16, padding: '18px 20px', borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' },
  cardTitle: { fontSize: 18, fontWeight: 800, marginBottom: 12 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 },
  field: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(0,0,0,0.18)', color: '#fff', padding: '9px 10px' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', opacity: 0.65, borderBottom: '1px solid rgba(255,255,255,0.12)' },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
};