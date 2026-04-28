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

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export default function WellnessAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rules, setRules] = useState(DEFAULT_SCORING_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [rebuildAllUsers, setRebuildAllUsers] = useState(true);
  const [newActivity, setNewActivity] = useState({ key: '', label: '', icon: '✨', unit: 'mins', physicalMultiplier: 0.5, physicalDivisor: 1, mentalMultiplier: 0.2, mentalDivisor: 1 });

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

  function removeActivityRule(key) {
    const defaultKeys = new Set(DEFAULT_SCORING_RULES.activities.map((rule) => rule.key));
    if (defaultKeys.has(key)) return;
    setRules((current) => ({
      ...current,
      activities: current.activities.filter((rule) => rule.key !== key),
    }));
  }

  function addActivityRule() {
    const normalizedKey = normalizeKey(newActivity.key || newActivity.label);
    if (!normalizedKey) {
      setMessage('Enter a key or label for the activity.');
      return;
    }

    setRules((current) => {
      if (current.activities.some((rule) => rule.key === normalizedKey)) {
        setMessage('Activity key already exists. Try another key.');
        return current;
      }
      const nextRule = {
        key: normalizedKey,
        label: String(newActivity.label || normalizedKey),
        icon: String(newActivity.icon || '✨'),
        unit: String(newActivity.unit || 'mins'),
        physicalMultiplier: numberValue(newActivity.physicalMultiplier, 0),
        physicalDivisor: Math.max(1, numberValue(newActivity.physicalDivisor, 1)),
        mentalMultiplier: numberValue(newActivity.mentalMultiplier, 0),
        mentalDivisor: Math.max(1, numberValue(newActivity.mentalDivisor, 1)),
      };
      setMessage('');
      return {
        ...current,
        activities: [...current.activities, nextRule],
      };
    });

    setNewActivity((current) => ({
      ...current,
      key: '',
      label: '',
      icon: '✨',
      unit: 'mins',
      physicalMultiplier: 0.5,
      physicalDivisor: 1,
      mentalMultiplier: 0.2,
      mentalDivisor: 1,
    }));
  }

  function handleSave() {
    setSaving(true);
    setMessage('');
    fetch(`${API_BASE}/wellness/scoring-rules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rules, options: { rebuildAllUsers } }),
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
        <div style={styles.grid4}>
          <label style={styles.field}><span>Baseline hours</span><input type="number" step="0.1" value={rules.sleep.baselineHours} onChange={(event) => updateSection('sleep', 'baselineHours', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Step hours</span><input type="number" step="0.1" value={rules.sleep.stepHours} onChange={(event) => updateSection('sleep', 'stepHours', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Score per step</span><input type="number" step="0.1" value={rules.sleep.scorePerStep} onChange={(event) => updateSection('sleep', 'scorePerStep', event.target.value)} style={styles.input} /></label>
          <label style={styles.field}><span>Default daily sleep hours</span><input type="number" step="0.1" value={rules.sleep.defaultHours ?? 0} onChange={(event) => updateSection('sleep', 'defaultHours', event.target.value)} style={styles.input} /></label>
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
        <div style={styles.grid4}>
          <label style={styles.field}><span>Key</span><input type="text" value={newActivity.key} onChange={(event) => setNewActivity((current) => ({ ...current, key: event.target.value }))} placeholder="example: dance_minutes" style={styles.input} /></label>
          <label style={styles.field}><span>Label</span><input type="text" value={newActivity.label} onChange={(event) => setNewActivity((current) => ({ ...current, label: event.target.value }))} placeholder="Dance" style={styles.input} /></label>
          <label style={styles.field}><span>Icon</span><input type="text" value={newActivity.icon} onChange={(event) => setNewActivity((current) => ({ ...current, icon: event.target.value }))} placeholder="✨" style={styles.input} /></label>
          <label style={styles.field}><span>Unit</span><input type="text" value={newActivity.unit} onChange={(event) => setNewActivity((current) => ({ ...current, unit: event.target.value }))} placeholder="mins" style={styles.input} /></label>
          <label style={styles.field}><span>Physical x</span><input type="number" step="0.1" value={newActivity.physicalMultiplier} onChange={(event) => setNewActivity((current) => ({ ...current, physicalMultiplier: event.target.value }))} style={styles.input} /></label>
          <label style={styles.field}><span>Physical /</span><input type="number" step="0.1" value={newActivity.physicalDivisor} onChange={(event) => setNewActivity((current) => ({ ...current, physicalDivisor: event.target.value }))} style={styles.input} /></label>
          <label style={styles.field}><span>Mental x</span><input type="number" step="0.1" value={newActivity.mentalMultiplier} onChange={(event) => setNewActivity((current) => ({ ...current, mentalMultiplier: event.target.value }))} style={styles.input} /></label>
          <label style={styles.field}><span>Mental /</span><input type="number" step="0.1" value={newActivity.mentalDivisor} onChange={(event) => setNewActivity((current) => ({ ...current, mentalDivisor: event.target.value }))} style={styles.input} /></label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={addActivityRule} style={styles.secondaryBtn}>Add Activity Rule</button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={rebuildAllUsers} onChange={(event) => setRebuildAllUsers(event.target.checked)} />
            Recalculate totals for all users and past dates on save
          </label>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Activity</th>
                <th style={styles.th}>Physical x</th>
                <th style={styles.th}>Physical /</th>
                <th style={styles.th}>Mental x</th>
                <th style={styles.th}>Mental /</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.activities.map((rule) => {
                const isDefault = DEFAULT_SCORING_RULES.activities.some((defaultRule) => defaultRule.key === rule.key);
                return (
                  <tr key={rule.key}>
                    <td style={styles.td}>{rule.icon} {rule.label}<div style={{ fontSize: 11, opacity: 0.7 }}>{rule.key} ({rule.unit})</div></td>
                    <td style={styles.td}><input type="number" step="0.1" value={rule.physicalMultiplier} onChange={(event) => updateActivityRule(rule.key, 'physicalMultiplier', event.target.value)} style={styles.input} /></td>
                    <td style={styles.td}><input type="number" step="0.1" value={rule.physicalDivisor} onChange={(event) => updateActivityRule(rule.key, 'physicalDivisor', event.target.value)} style={styles.input} /></td>
                    <td style={styles.td}><input type="number" step="0.1" value={rule.mentalMultiplier} onChange={(event) => updateActivityRule(rule.key, 'mentalMultiplier', event.target.value)} style={styles.input} /></td>
                    <td style={styles.td}><input type="number" step="0.1" value={rule.mentalDivisor} onChange={(event) => updateActivityRule(rule.key, 'mentalDivisor', event.target.value)} style={styles.input} /></td>
                    <td style={styles.td}>
                      <button disabled={isDefault} onClick={() => removeActivityRule(rule.key)} style={isDefault ? styles.removeBtnDisabled : styles.removeBtn}>
                        {isDefault ? 'Default' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                );
              })}
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
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 },
  field: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(0,0,0,0.18)', color: '#fff', padding: '9px 10px' },
  tableWrap: { overflowX: 'auto', marginTop: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', opacity: 0.65, borderBottom: '1px solid rgba(255,255,255,0.12)' },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  removeBtn: { border: '1px solid rgba(248,113,113,0.5)', borderRadius: 10, padding: '7px 10px', background: 'rgba(127,29,29,0.5)', color: '#fecaca', cursor: 'pointer', fontWeight: 700 },
  removeBtnDisabled: { border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '7px 10px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'not-allowed', fontWeight: 700 },
};