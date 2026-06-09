import { useEffect, useMemo, useState } from 'react';

function threadEmoji(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('goa') || lower.includes('beach')) return '🏖️';
  if (lower.includes('family')) return '👨‍👩‍👧';
  if (lower.includes('ooty') || lower.includes('trip') || lower.includes('travel')) return '🏔️';
  if (lower.includes('wedding')) return '💒';
  return '🧵';
}

function coverGradient(name) {
  const hues = [220, 260, 320, 180, 40, 280];
  const h = hues[Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % hues.length];
  return `linear-gradient(135deg, hsl(${h} 72% 42%), hsl(${(h + 40) % 360} 68% 52%))`;
}

function isDisplayableMediaUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === 'null' || value === 'undefined') return false;
  return /^(https?:\/\/|\/|blob:)/i.test(value);
}

function RecentMemoriesStrip({ items, onOpenThread, theme }) {
  const [failedIds, setFailedIds] = useState(() => new Set());

  useEffect(() => {
    setFailedIds(new Set());
  }, [items]);

  const visibleItems = items.filter((item) => !failedIds.has(item.id));
  if (!visibleItems.length) return null;

  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.textMuted }}>
        Recent memories
      </p>
      <div className="chat-hub-memories">
        {visibleItems.slice(0, 12).map((item) => (
          <button
            key={item.id}
            type="button"
            className="chat-hub-memory"
            onClick={() => onOpenThread(item.thread)}
            title={item.thread?.name || 'Open thread'}
          >
            {item.mediaType === 'video' ? (
              <video
                src={item.imageUrl}
                muted
                playsInline
                preload="metadata"
                onError={() => setFailedIds((prev) => new Set([...prev, item.id]))}
              />
            ) : (
              <img
                src={item.imageUrl}
                alt=""
                onError={() => setFailedIds((prev) => new Set([...prev, item.id]))}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThreadCoverThumb({ group, unread }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = isDisplayableMediaUrl(group.coverImageUrl) && !coverFailed;

  return (
    <div className="chat-hub-thread-thumb" style={{ background: coverGradient(group.name) }}>
      {showCover ? (
        group.coverMediaType === 'video' ? (
          <video src={group.coverImageUrl} muted playsInline onError={() => setCoverFailed(true)} />
        ) : (
          <img src={group.coverImageUrl} alt="" onError={() => setCoverFailed(true)} />
        )
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 22 }}>{threadEmoji(group.name)}</div>
      )}
      {unread ? <span className="chat-hub-unread">{unread}</span> : null}
    </div>
  );
}

function isGroupDescendant(groups, ancestorId, candidateParentId) {
  let current = candidateParentId;
  const seen = new Set();
  while (current) {
    if (current === ancestorId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    const group = groups.find((entry) => entry.id === current);
    current = group?.parentGroupId || null;
  }
  return false;
}

export function ChatHomeHub({
  theme,
  user,
  threadRows = [],
  allGroups = [],
  friends = [],
  recentMedia = [],
  unreadCounts = {},
  getChatKey,
  isUserOnline,
  getUserColor,
  incomingRequests = [],
  hubTab = 'threads',
  onHubTabChange,
  onOpenThread,
  onOpenFriend,
  onCreateThread,
  onJoinThread,
  onAcceptBuddy,
  onMoveThread,
  connectionState,
  isBootstrapLoading = false,
}) {
  const [draggingThreadId, setDraggingThreadId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');

  const visibleRecentMedia = useMemo(
    () => recentMedia.filter((item) => isDisplayableMediaUrl(item.imageUrl)),
    [recentMedia],
  );

  const threadStats = useMemo(
    () => threadRows.map(({ group, depth }) => ({
      group,
      depth,
      albums: (group.folders || []).length,
      media: (group.images || []).length,
      members: (group.memberships || []).length,
      unread: unreadCounts[getChatKey?.({ type: 'group', id: group.id })] || 0,
      childCount: allGroups.filter((entry) => entry.parentGroupId === group.id).length,
    })),
    [threadRows, allGroups, unreadCounts, getChatKey],
  );

  const topLevelCount = useMemo(
    () => allGroups.filter((group) => !group.parentGroupId).length,
    [allGroups],
  );

  const handleDropOnThread = (targetGroupId) => {
    if (!draggingThreadId || !onMoveThread) return;
    if (draggingThreadId === targetGroupId) return;
    if (isGroupDescendant(allGroups, draggingThreadId, targetGroupId)) return;
    onMoveThread(draggingThreadId, targetGroupId);
    setDraggingThreadId('');
    setDropTargetId('');
  };

  const handleDropOnTopLevel = () => {
    if (!draggingThreadId || !onMoveThread) return;
    onMoveThread(draggingThreadId, null);
    setDraggingThreadId('');
    setDropTargetId('');
  };

  return (
    <>
      <style>{`
        .chat-hub {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 16px 14px calc(96px + env(safe-area-inset-bottom, 0px));
          background:
            radial-gradient(circle at 0% 0%, rgba(56,189,248,0.12), transparent 42%),
            radial-gradient(circle at 100% 8%, rgba(167,139,250,0.14), transparent 38%),
            ${theme.pageBg};
        }
        .chat-hub-hero {
          border-radius: 22px;
          padding: 18px 16px;
          border: 1px solid ${theme.cardBorder};
          background: linear-gradient(135deg, ${theme.blue}18, ${theme.purple}14);
          display: grid;
          gap: 10px;
          margin-bottom: 16px;
        }
        .chat-hub-hero-title {
          margin: 0;
          font-size: clamp(20px, 4vw, 26px);
          font-weight: 900;
          color: ${theme.textHeading};
          line-height: 1.15;
        }
        .chat-hub-hero-text {
          margin: 0;
          font-size: 13px;
          line-height: 1.55;
          color: ${theme.textSecondary};
        }
        .chat-hub-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 14px;
        }
        .chat-hub-tab {
          border: 1px solid ${theme.cardBorder};
          background: ${theme.cardBg};
          color: ${theme.textSecondary};
          border-radius: 14px;
          padding: 11px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }
        .chat-hub-tab.is-active {
          background: ${theme.blue}22;
          border-color: ${theme.blue};
          color: ${theme.blue};
        }
        .chat-hub-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .chat-hub-btn {
          border: none;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }
        .chat-hub-btn-primary {
          background: linear-gradient(135deg, ${theme.blue}, ${theme.purple});
          color: #fff;
        }
        .chat-hub-btn-secondary {
          background: ${theme.cardBg};
          color: ${theme.textHeading};
          border: 1px solid ${theme.cardBorder};
        }
        .chat-hub-thread-list { display: grid; gap: 10px; }
        .chat-hub-thread-row {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          align-items: center;
          border-radius: 16px;
          border: 1px solid ${theme.cardBorder};
          background: ${theme.cardBg};
          padding: 8px 10px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .chat-hub-thread-row.is-drop-target {
          border-color: ${theme.blue};
          box-shadow: 0 0 0 2px ${theme.blue}33;
        }
        .chat-hub-thread-row.is-dragging { opacity: 0.55; }
        .chat-hub-thread-open {
          border: none;
          background: transparent;
          padding: 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          align-items: center;
          text-align: left;
          cursor: pointer;
          color: inherit;
          font-family: inherit;
          min-width: 0;
        }
        .chat-hub-thread-thumb {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          flex-shrink: 0;
        }
        .chat-hub-thread-thumb img,
        .chat-hub-thread-thumb video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .chat-hub-thread-name {
          font-size: 14px;
          font-weight: 900;
          color: ${theme.textHeading};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-hub-thread-meta { font-size: 10px; color: ${theme.textMuted}; line-height: 1.4; }
        .chat-hub-drag-handle {
          border: 1px solid ${theme.cardBorder};
          background: ${theme.panelBg};
          color: ${theme.textMuted};
          border-radius: 10px;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          cursor: grab;
          font-size: 14px;
          flex-shrink: 0;
        }
        .chat-hub-drop-root {
          border: 1px dashed ${theme.cardBorder};
          border-radius: 14px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 700;
          color: ${theme.textMuted};
          text-align: center;
          margin-bottom: 10px;
        }
        .chat-hub-drop-root.is-drop-target {
          border-color: ${theme.blue};
          color: ${theme.blue};
          background: ${theme.blue}12;
        }
        .chat-hub-move-hint {
          margin: 0 0 10px;
          font-size: 11px;
          color: ${theme.textMuted};
          line-height: 1.45;
        }
        .chat-hub-unread {
          position: absolute;
          top: 4px;
          right: 4px;
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          background: ${theme.orange};
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          display: grid;
          place-items: center;
          padding: 0 5px;
        }
        .chat-hub-memories {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
          margin-bottom: 16px;
          scroll-snap-type: x mandatory;
        }
        .chat-hub-memory {
          flex: 0 0 92px;
          width: 92px;
          height: 92px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid ${theme.cardBorder};
          scroll-snap-align: start;
          position: relative;
        }
        .chat-hub-memory img,
        .chat-hub-memory video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .chat-hub-friend-list { display: grid; gap: 8px; }
        .chat-hub-friend {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid ${theme.cardBorder};
          background: ${theme.cardBg};
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          color: inherit;
        }
        .chat-hub-friend-avatar {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: #fff;
          font-weight: 800;
          font-size: 13px;
          flex-shrink: 0;
        }
        .chat-hub-empty {
          text-align: center;
          padding: 28px 16px;
          border-radius: 18px;
          border: 1px dashed ${theme.cardBorder};
          color: ${theme.textMuted};
          font-size: 13px;
          line-height: 1.55;
        }
        .chat-hub-loading-inline {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 0 4px;
          font-size: 12px;
          color: ${theme.textMuted};
        }
        .chat-hub-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid ${theme.cardBorder};
          border-top-color: ${theme.blue};
          border-radius: 50%;
          animation: chat-hub-spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes chat-hub-spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 720px) {
          .chat-hub-tabs,
          .chat-hub-actions { display: none; }
        }
        @media (min-width: 900px) {
          .chat-hub { padding: 22px 24px calc(24px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      <div className="chat-hub">
        {hubTab === 'threads' ? (
          <>
            <section className="chat-hub-hero">
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.textMuted }}>
                Trip threads · Cosmix
              </p>
              <h1 className="chat-hub-hero-title">Plan trips, chat, and save memories</h1>
              <p className="chat-hub-hero-text">
                Create a thread like <strong>Goa with family</strong> — chat with your group, bookmark places & messages,
                and build albums (<em>Goa Day 1</em> → subfolders → photos & videos).
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: 11, color: theme.textMuted }}>
                <span>💬 Group chat</span>
                <span>🔖 Saved spots</span>
                <span>📸 Album folders</span>
                <span>🔗 Invite link</span>
                <span style={{ color: connectionState === 'connected' ? theme.green : theme.orange }}>
                  {connectionState === 'connected' ? '● Live' : '○ Connecting…'}
                </span>
              </div>
            </section>

            {!isBootstrapLoading && visibleRecentMedia.length > 0 ? (
              <RecentMemoriesStrip items={visibleRecentMedia} onOpenThread={onOpenThread} theme={theme} />
            ) : null}
          </>
        ) : null}

        <div className="chat-hub-tabs">
          <button type="button" className={`chat-hub-tab${hubTab === 'threads' ? ' is-active' : ''}`} onClick={() => onHubTabChange?.('threads')}>
            🧵 Threads ({topLevelCount})
          </button>
          <button type="button" className={`chat-hub-tab${hubTab === 'friends' ? ' is-active' : ''}`} onClick={() => onHubTabChange?.('friends')}>
            👋 Friends ({friends.length})
          </button>
        </div>

        {hubTab === 'threads' ? (
          <div className="chat-hub-actions">
            <button type="button" className="chat-hub-btn chat-hub-btn-primary" onClick={onCreateThread}>
              + New trip thread
            </button>
            <button type="button" className="chat-hub-btn chat-hub-btn-secondary" onClick={onJoinThread}>
              Join with link
            </button>
          </div>
        ) : null}

        {incomingRequests.length > 0 ? (
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: theme.textHeading }}>Buddy requests</p>
            {incomingRequests.map((name) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
                <button type="button" className="chat-hub-btn chat-hub-btn-primary" style={{ padding: '6px 10px' }} onClick={() => onAcceptBuddy(name)}>Accept</button>
              </div>
            ))}
          </div>
        ) : null}

        {hubTab === 'threads' ? (
          isBootstrapLoading ? (
            <div className="chat-hub-loading-inline" aria-busy="true" aria-label="Loading threads">
              <span className="chat-hub-spinner" />
              <span>Loading threads…</span>
            </div>
          ) : threadStats.length ? (
            <>
              <p className="chat-hub-move-hint">Drag the ⋮⋮ handle onto another thread to nest it (Family → Goa trip). Drop on the bar below to move back to top level.</p>
              {draggingThreadId ? (
                <div
                  className={`chat-hub-drop-root${dropTargetId === '__root__' ? ' is-drop-target' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setDropTargetId('__root__'); }}
                  onDragLeave={() => { if (dropTargetId === '__root__') setDropTargetId(''); }}
                  onDrop={(event) => { event.preventDefault(); handleDropOnTopLevel(); }}
                >
                  ↥ Drop here for top-level thread
                </div>
              ) : null}
              <div className="chat-hub-thread-list">
                {threadStats.map(({ group, depth, albums, media, members, unread, childCount }) => (
                  <div
                    key={group.id}
                    className={`chat-hub-thread-row${draggingThreadId === group.id ? ' is-dragging' : ''}${dropTargetId === group.id ? ' is-drop-target' : ''}`}
                    style={{ marginLeft: `${Math.min(depth, 6) * 14}px` }}
                    onDragOver={(event) => {
                      if (!draggingThreadId || draggingThreadId === group.id) return;
                      if (isGroupDescendant(allGroups, draggingThreadId, group.id)) return;
                      event.preventDefault();
                      setDropTargetId(group.id);
                    }}
                    onDragLeave={() => { if (dropTargetId === group.id) setDropTargetId(''); }}
                    onDrop={(event) => { event.preventDefault(); handleDropOnThread(group.id); }}
                  >
                    <button
                      type="button"
                      className="chat-hub-drag-handle"
                      draggable
                      aria-label={`Move ${group.name}`}
                      onDragStart={() => setDraggingThreadId(group.id)}
                      onDragEnd={() => { setDraggingThreadId(''); setDropTargetId(''); }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      ⋮⋮
                    </button>
                    <button type="button" className="chat-hub-thread-open" onClick={() => onOpenThread(group)}>
                      <ThreadCoverThumb group={group} unread={unread} />
                      <div style={{ minWidth: 0 }}>
                        <div className="chat-hub-thread-name">{depth ? `${'↳ '.repeat(Math.min(depth, 3))}${group.name}` : group.name}</div>
                        <div className="chat-hub-thread-meta">
                          {members} member{members === 1 ? '' : 's'} · {albums} album{albums === 1 ? '' : 's'} · {media} photo{media === 1 ? '' : 's'}
                          {childCount ? ` · ${childCount} nested` : ''}
                        </div>
                        {group.description ? (
                          <div className="chat-hub-thread-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.description}</div>
                        ) : null}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="chat-hub-empty">
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏖️</div>
              <strong style={{ color: theme.textHeading }}>Start your first trip thread</strong>
              <p style={{ margin: '8px 0 0' }}>Example: &quot;Goa family 2026&quot; — then add Day 1 albums and invite family.</p>
            </div>
          )
        ) : (
          friends.length ? (
            <div className="chat-hub-friend-list">
              {friends.map((friendName) => (
                <button key={friendName} type="button" className="chat-hub-friend" onClick={() => onOpenFriend(friendName)}>
                  <div className="chat-hub-friend-avatar" style={{ background: getUserColor(friendName, theme) }}>
                    {friendName.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: theme.textHeading }}>{friendName}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>{isUserOnline(friendName) ? 'Online · tap to chat' : 'Offline · tap to chat'}</div>
                  </div>
                  <span style={{ fontSize: 18 }}>💬</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="chat-hub-empty">
              <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
              <strong style={{ color: theme.textHeading }}>No friends yet</strong>
              <p style={{ margin: '8px 0 0' }}>Add buddies from the menu (☰) to start direct messages.</p>
            </div>
          )
        )}
      </div>
    </>
  );
}
