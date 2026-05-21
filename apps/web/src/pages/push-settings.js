import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';

async function readJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Request failed.');
  }
  return payload;
}

export default function PushSettingsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading preferences...');
  const [prefs, setPrefs] = useState({
    muteAll: false,
    wellnessReminderEnabled: true,
    mutedGroupIds: [],
    mutedUsernames: [],
  });

  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const chatApiBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  useEffect(() => {
    if (!user?.username) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${chatApiBase}/bootstrap?username=${encodeURIComponent(user.username)}`);
        const payload = await readJsonResponse(response);
        if (!active) return;
        setFriends(payload.friends || []);
        setGroups(payload.groups || []);
        const nextPrefs = payload.pushPreferences || {};
        setPrefs({
          muteAll: Boolean(nextPrefs.muteAll),
          wellnessReminderEnabled: nextPrefs.wellnessReminderEnabled !== false,
          mutedGroupIds: Array.isArray(nextPrefs.mutedGroupIds) ? nextPrefs.mutedGroupIds : [],
          mutedUsernames: Array.isArray(nextPrefs.mutedUsernames) ? nextPrefs.mutedUsernames : [],
        });
        setStatus('Ready');
      } catch (error) {
        if (!active) return;
        setStatus(error.message || 'Unable to load push preferences.');
      }
    })();

    return () => {
      active = false;
    };
  }, [chatApiBase, user?.username]);

  const mutedGroupSet = useMemo(() => new Set(prefs.mutedGroupIds || []), [prefs.mutedGroupIds]);
  const mutedUserSet = useMemo(() => new Set((prefs.mutedUsernames || []).map((entry) => String(entry || '').toLowerCase())), [prefs.mutedUsernames]);

  function toggleGroup(groupId) {
    const next = new Set(mutedGroupSet);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setPrefs((previous) => ({ ...previous, mutedGroupIds: Array.from(next) }));
  }

  function toggleFriend(username) {
    const key = String(username || '').toLowerCase();
    const next = new Set(mutedUserSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPrefs((previous) => ({ ...previous, mutedUsernames: Array.from(next) }));
  }

  async function savePreferences() {
    if (!user?.username) return;
    setSaving(true);
    setStatus('Saving preferences...');
    try {
      const response = await fetch(`${chatApiBase}/push/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUsername: user.username,
          muteAll: Boolean(prefs.muteAll),
          wellnessReminderEnabled: prefs.wellnessReminderEnabled !== false,
          mutedGroupIds: prefs.mutedGroupIds,
          mutedUsernames: prefs.mutedUsernames,
        }),
      });
      const payload = await readJsonResponse(response);
      setPrefs({
        muteAll: Boolean(payload.muteAll),
        wellnessReminderEnabled: payload.wellnessReminderEnabled !== false,
        mutedGroupIds: Array.isArray(payload.mutedGroupIds) ? payload.mutedGroupIds : [],
        mutedUsernames: Array.isArray(payload.mutedUsernames) ? payload.mutedUsernames : [],
      });
      setStatus('Preferences saved.');
    } catch (error) {
      setStatus(error.message || 'Unable to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, fontFamily: theme.font, padding: '20px 16px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 26, color: theme.textHeading }}>Push Notification Settings</h1>
          <button type="button" onClick={() => router.push('/dashboard')} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.textPrimary, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontFamily: theme.font }}>
            Back
          </button>
        </div>

        <p style={{ margin: 0, color: theme.textMuted }}>{status}</p>

        <section style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, background: theme.panelBg, padding: 14, display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(prefs.muteAll)} onChange={(e) => setPrefs((prev) => ({ ...prev, muteAll: e.target.checked }))} />
            Mute all push notifications
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={prefs.wellnessReminderEnabled !== false} onChange={(e) => setPrefs((prev) => ({ ...prev, wellnessReminderEnabled: e.target.checked }))} />
            Enable daily wellness reminder push
          </label>
        </section>

        <section style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, background: theme.panelBg, padding: 14, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: theme.textHeading }}>Muted Groups</h2>
          {groups.length ? groups.map((group) => (
            <label key={group.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={mutedGroupSet.has(group.id)} onChange={() => toggleGroup(group.id)} />
              {group.name}
            </label>
          )) : <p style={{ margin: 0, color: theme.textMuted }}>No groups found.</p>}
        </section>

        <section style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, background: theme.panelBg, padding: 14, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: theme.textHeading }}>Muted Direct Messages</h2>
          {friends.length ? friends.map((friend) => (
            <label key={friend} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={mutedUserSet.has(String(friend || '').toLowerCase())} onChange={() => toggleFriend(friend)} />
              {friend}
            </label>
          )) : <p style={{ margin: 0, color: theme.textMuted }}>No buddies found.</p>}
        </section>

        <button type="button" onClick={savePreferences} disabled={saving || !user?.username} style={{ border: 'none', borderRadius: 12, padding: '12px 14px', fontWeight: 700, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', background: saving ? theme.cardBgAlt : `linear-gradient(135deg, ${theme.blue}, ${theme.orange})`, color: '#fff', fontFamily: theme.font }}>
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </main>
  );
}
