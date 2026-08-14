import { useMemo, useState } from 'react';

function threadEmoji(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('goa') || lower.includes('beach')) return '🏖️';
  if (lower.includes('family')) return '👨‍👩‍👧';
  if (lower.includes('ooty') || lower.includes('trip') || lower.includes('travel')) return '🏔️';
  if (lower.includes('wedding')) return '💒';
  if (lower.includes('work') || lower.includes('office')) return '💼';
  if (lower.includes('run') || lower.includes('fit')) return '🏃';
  return '🧵';
}

function coverGradient(name) {
  const hues = [0, 220, 40, 160, 280, 120];
  const h = hues[Math.abs(String(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % hues.length];
  return `linear-gradient(145deg, hsl(${h} 12% 12%), hsl(${(h + 30) % 360} 10% 22%))`;
}

function isDisplayableMediaUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === 'null' || value === 'undefined') return false;
  return /^(https?:\/\/|\/|blob:)/i.test(value);
}

function formatCreatedAt(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ThreadCover({ group }) {
  const [failed, setFailed] = useState(false);
  const showCover = isDisplayableMediaUrl(group.coverImageUrl) && !failed;

  return (
    <div className="dashboard-thread-cover" style={{ background: coverGradient(group.name) }}>
      {showCover ? (
        group.coverMediaType === 'video' ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={group.coverImageUrl} muted playsInline preload="metadata" onError={() => setFailed(true)} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.coverImageUrl} alt="" onError={() => setFailed(true)} />
        )
      ) : (
        <div className="dashboard-thread-cover-fallback" aria-hidden="true">{threadEmoji(group.name)}</div>
      )}
      <div className="dashboard-thread-cover-scrim" />
    </div>
  );
}

export default function ThreadsModule({
  groups = [],
  theme,
  username = '',
  loading = false,
  onOpenThread,
  onCreateThread,
  onJoinThread,
}) {
  const [query, setQuery] = useState('');

  const topLevelThreads = useMemo(
    () => (Array.isArray(groups) ? groups : []).filter((group) => !group?.parentGroupId),
    [groups],
  );

  const childCountByParent = useMemo(() => {
    const map = new Map();
    (groups || []).forEach((group) => {
      if (!group?.parentGroupId) return;
      map.set(group.parentGroupId, (map.get(group.parentGroupId) || 0) + 1);
    });
    return map;
  }, [groups]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = topLevelThreads.map((group) => ({
      group,
      members: (group.memberships || []).length,
      media: (group.images || []).length,
      albums: (group.folders || []).length,
      children: childCountByParent.get(group.id) || 0,
      createdLabel: formatCreatedAt(group.createdAt),
      isOwner: String(group.createdBy || '').toLowerCase() === String(username || '').toLowerCase(),
    }));
    if (!needle) return rows;
    return rows.filter(({ group }) => {
      const hay = `${group.name || ''} ${group.description || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [topLevelThreads, childCountByParent, query, username]);

  if (loading) {
    return (
      <div className="dashboard-threads-empty" style={{ borderColor: theme.cardBorder, color: theme.textMuted }}>
        Loading your threads…
      </div>
    );
  }

  return (
    <div className="dashboard-threads">
      <style>{`
        .dashboard-threads {
          display: grid;
          gap: 14px;
        }
        .dashboard-threads-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .dashboard-threads-search {
          flex: 1;
          min-width: 180px;
          appearance: none;
          border: 1px solid rgba(255,255,255,0.1);
          background: #0a0a0a;
          color: #f4f4f5;
          border-radius: 14px;
          padding: 11px 14px;
          font-size: 13px;
          font-family: inherit;
          outline: none;
        }
        .dashboard-threads-search:focus {
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.06);
        }
        .dashboard-threads-search::placeholder { color: #71717a; }
        .dashboard-threads-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dashboard-threads-btn {
          appearance: none;
          border: none;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }
        .dashboard-threads-btn--primary {
          background: #fafafa;
          color: #09090b;
        }
        .dashboard-threads-btn--ghost {
          background: #141414;
          color: #f4f4f5;
          border: 1px solid rgba(255,255,255,0.12);
        }
        .dashboard-threads-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .dashboard-thread-card {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          overflow: hidden;
          background: #0a0a0a;
          padding: 0;
          cursor: pointer;
          text-align: left;
          color: inherit;
          font-family: inherit;
          display: grid;
          grid-template-rows: 132px auto;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .dashboard-thread-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255,255,255,0.22);
        }
        .dashboard-thread-cover {
          position: relative;
          height: 132px;
          overflow: hidden;
        }
        .dashboard-thread-cover img,
        .dashboard-thread-cover video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .dashboard-thread-cover-fallback {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-size: 42px;
        }
        .dashboard-thread-cover-scrim {
          position: absolute;
          inset: auto 0 0 0;
          height: 48%;
          background: linear-gradient(180deg, transparent, rgba(0,0,0,0.88));
        }
        .dashboard-thread-body {
          display: grid;
          gap: 8px;
          padding: 14px 14px 16px;
        }
        .dashboard-thread-name {
          font-size: 16px;
          font-weight: 900;
          color: #f8fafc;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.02em;
        }
        .dashboard-thread-desc {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.45;
          min-height: 34px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dashboard-thread-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .dashboard-thread-chip {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 5px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.06);
          color: #d4d4d8;
        }
        .dashboard-thread-chip--owner {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.1);
          color: #fafafa;
        }
        .dashboard-threads-empty {
          border-radius: 20px;
          border: 1px dashed rgba(255,255,255,0.16);
          padding: 36px 20px;
          text-align: center;
          display: grid;
          gap: 10px;
          justify-items: center;
          background: #0a0a0a;
        }
        .dashboard-threads-empty-title {
          font-size: 18px;
          font-weight: 900;
          color: #fafafa;
        }
        .dashboard-threads-empty-text {
          font-size: 13px;
          line-height: 1.5;
          max-width: 360px;
          color: #a1a1aa;
        }
        @media (max-width: 560px) {
          .dashboard-threads-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="dashboard-threads-toolbar">
        <input
          className="dashboard-threads-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search threads…"
          aria-label="Search threads"
        />
        <div className="dashboard-threads-actions">
          <button type="button" className="dashboard-threads-btn dashboard-threads-btn--primary" onClick={onCreateThread}>
            + New thread
          </button>
          <button type="button" className="dashboard-threads-btn dashboard-threads-btn--ghost" onClick={onJoinThread}>
            Join
          </button>
        </div>
      </div>

      {!filtered.length ? (
        <div className="dashboard-threads-empty" style={{ borderColor: theme.cardBorder }}>
          <div style={{ fontSize: 36 }} aria-hidden="true">🧵</div>
          <div className="dashboard-threads-empty-title">
            {query.trim() ? 'No matching threads' : 'No threads yet'}
          </div>
          <div className="dashboard-threads-empty-text">
            {query.trim()
              ? 'Try a different name, or create a new space for your group.'
              : 'Create your first thread for trips, family, or training crews — photos, folders, and chat live together.'}
          </div>
          <div className="dashboard-threads-actions">
            <button type="button" className="dashboard-threads-btn dashboard-threads-btn--primary" onClick={onCreateThread}>
              Create thread
            </button>
            <button type="button" className="dashboard-threads-btn dashboard-threads-btn--ghost" onClick={onJoinThread}>
              Join with link
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-threads-grid">
          {filtered.map(({ group, members, media, albums, children, createdLabel, isOwner }) => (
            <button
              key={group.id}
              type="button"
              className="dashboard-thread-card"
              onClick={() => onOpenThread(group)}
            >
              <ThreadCover group={group} />
              <div className="dashboard-thread-body">
                <div className="dashboard-thread-name">{group.name || 'Untitled thread'}</div>
                <div className="dashboard-thread-desc">
                  {group.description?.trim() || 'Open to chat, albums, and trip memories.'}
                </div>
                <div className="dashboard-thread-meta">
                  {members > 0 ? <span className="dashboard-thread-chip">{members} member{members === 1 ? '' : 's'}</span> : null}
                  {media > 0 ? <span className="dashboard-thread-chip">{media} photo{media === 1 ? '' : 's'}</span> : null}
                  {albums > 0 ? <span className="dashboard-thread-chip">{albums} album{albums === 1 ? '' : 's'}</span> : null}
                  {children > 0 ? <span className="dashboard-thread-chip">{children} nested</span> : null}
                  {createdLabel ? <span className="dashboard-thread-chip">{createdLabel}</span> : null}
                  {isOwner ? <span className="dashboard-thread-chip dashboard-thread-chip--owner">Yours</span> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
