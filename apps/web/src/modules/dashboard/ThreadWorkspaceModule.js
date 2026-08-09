import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildFolderTree } from '../../lib/ChatAlbumGallery';
import { ChatMediaLightbox } from '../../lib/ChatMediaLightbox';
import ThreadInlineChat from '../../lib/ThreadInlineChat';
import { createUploadSession, ThreadUploadProgress } from '../../lib/ThreadUploadProgress';

function threadEmoji(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('cricket')) return '🏏';
  if (lower.includes('football') || lower.includes('soccer')) return '⚽';
  if (lower.includes('goa') || lower.includes('beach')) return '🏖️';
  if (lower.includes('family')) return '👨‍👩‍👧';
  if (lower.includes('day')) return '📅';
  if (lower.includes('trip') || lower.includes('travel')) return '🏔️';
  return '📁';
}

function isVideoMedia(image) {
  if (!image) return false;
  if (image.mediaType === 'video') return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(image.imageUrl || image.s3Key || ''));
}

function ExplorerContextMenu({ menu, onClose, onAction }) {
  if (!menu) return null;
  const items = menu.target === 'folder'
    ? [
      { id: 'open', label: 'Open' },
      { id: 'subfolder', label: 'New subfolder' },
      { id: 'upload', label: 'Upload photos/videos' },
    ]
    : [
      { id: 'newfolder', label: 'New folder' },
      ...(menu.folderId ? [{ id: 'upload', label: 'Upload photos/videos' }] : []),
    ];

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        onContextMenu={(event) => { event.preventDefault(); onClose(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 40, border: 'none', background: 'transparent', cursor: 'default' }}
      />
      <div
        className="thread-explorer-menu"
        style={{ top: menu.y, left: menu.x }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="thread-explorer-menu-item"
            onClick={() => onAction(item.id, menu)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function ThreadWorkspaceModule({
  thread,
  theme,
  username = '',
  userId = null,
  avatar = null,
  onBack,
  onCreateFolder,
  onUploadToFolder,
  onRefresh,
}) {
  const [threadMode, setThreadMode] = useState('photos'); // photos | chat
  const [folderPath, setFolderPath] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [menu, setMenu] = useState(null);
  const [pendingFolderName, setPendingFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(null);
  const [uploadSession, setUploadSession] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  useEffect(() => {
    setFolderPath([]);
    setSelectedFolderId('');
    setMenu(null);
    setCreatingFolder(null);
    setLightboxIndex(null);
    setCommentDrafts({});
    setCommentError('');
    setThreadMode('photos');
  }, [thread?.id]);

  const folderTree = useMemo(() => buildFolderTree(thread?.folders || []), [thread?.folders]);
  const currentFolder = folderPath.length ? folderPath[folderPath.length - 1] : null;
  const currentParentId = currentFolder?.id || null;
  const currentFolders = folderTree.get(currentParentId) || [];

  const imageById = useMemo(
    () => Object.fromEntries((thread?.images || []).map((image) => [image.id, image])),
    [thread?.images],
  );

  const currentMedia = useMemo(() => {
    if (!currentFolder) return [];
    const imageIds = new Set(
      (currentFolder.items || [])
        .filter((item) => item.imageId)
        .map((item) => item.imageId),
    );
    return (thread?.images || []).filter((image) => imageIds.has(image.id));
  }, [currentFolder, thread?.images]);

  const canComment = useMemo(() => {
    const membership = (thread?.memberships || []).find(
      (entry) => String(entry.username || '').toLowerCase() === String(username || '').toLowerCase(),
    );
    if (!membership) return Boolean(username);
    return membership.canComment !== false;
  }, [thread?.memberships, username]);

  const pathLabel = ['Home', ...folderPath.map((folder) => folder.name)].join(' / ');

  function openFolder(folder) {
    if (!folder) return;
    setFolderPath((path) => [...path, folder]);
    setSelectedFolderId(folder.id);
  }

  function goToPathIndex(index) {
    if (index <= 0) {
      setFolderPath([]);
    } else {
      setFolderPath((path) => path.slice(0, index));
    }
  }

  function openContextMenu(event, payload) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 180),
      ...payload,
    });
  }

  async function submitNewFolder(name, parentId) {
    if (!name.trim() || !onCreateFolder) return;
    await onCreateFolder(name.trim(), parentId);
    setPendingFolderName('');
    setCreatingFolder(null);
    if (onRefresh) await onRefresh();
  }

  function startUpload(folderId) {
    uploadTargetRef.current = folderId || currentFolder?.id || null;
    fileInputRef.current?.click();
  }

  function reportUploadProgress(update) {
    setUploadSession((previous) => {
      if (!previous) return previous;
      const fileStates = previous.fileStates.map((entry, index) => {
        if (index !== update.index) return entry;
        return {
          ...entry,
          percent: update.percent ?? entry.percent,
          status: update.status ?? entry.status,
        };
      });
      const completed = fileStates.filter((entry) => entry.status === 'done').length;
      const failed = fileStates.filter((entry) => entry.status === 'error').length;
      const overallPercent = fileStates.reduce((sum, entry) => sum + entry.percent, 0) / Math.max(1, fileStates.length);
      return {
        ...previous,
        active: true,
        fileStates,
        completed,
        failed,
        currentIndex: update.index,
        currentName: fileStates[update.index]?.name || previous.currentName,
        currentPhase: update.phase || previous.currentPhase,
        overallPercent,
        message: update.message || previous.message,
      };
    });
  }

  async function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const folderId = uploadTargetRef.current;
    if (!files.length || !folderId || !onUploadToFolder) return;

    setUploadSession(createUploadSession(files));
    try {
      await onUploadToFolder(files, folderId, reportUploadProgress);
      if (onRefresh) await onRefresh();
    } catch (error) {
      setUploadSession((previous) => (
        previous
          ? { ...previous, message: error?.message || 'Upload failed', currentPhase: 'error' }
          : previous
      ));
    }
  }

  function handleMenuAction(actionId, menuState) {
    setMenu(null);
    if (actionId === 'open' && menuState.folder) {
      openFolder(menuState.folder);
      return;
    }
    if (actionId === 'newfolder') {
      setCreatingFolder({ parentId: currentParentId, label: 'New folder' });
      setPendingFolderName('');
      return;
    }
    if (actionId === 'subfolder' && menuState.folder) {
      setCreatingFolder({ parentId: menuState.folder.id, label: `Subfolder in ${menuState.folder.name}` });
      setPendingFolderName('');
      return;
    }
    if (actionId === 'upload') {
      startUpload(menuState.folder?.id || menuState.folderId || currentFolder?.id);
    }
  }

  function openPhotoAt(imageId) {
    const idx = currentMedia.findIndex((image) => image.id === imageId);
    if (idx < 0) return;
    setLightboxIndex(idx);
    setCommentError('');
  }

  async function handlePostComment(imageId) {
    const body = String(commentDrafts[imageId] || '').trim();
    if (!body || !thread?.id || !username) return;
    setPostingComment(true);
    setCommentError('');
    try {
      const response = await fetch(`/chat-api/chat/groups/${encodeURIComponent(thread.id)}/images/${encodeURIComponent(imageId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorUsername: username, body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Could not post comment.');
      }
      setCommentDrafts((previous) => ({ ...previous, [imageId]: '' }));
      if (onRefresh) await onRefresh();
    } catch (error) {
      setCommentError(error?.message || 'Could not post comment.');
    } finally {
      setPostingComment(false);
    }
  }

  const inChat = threadMode === 'chat';
  const inPhotos = threadMode === 'photos';

  useEffect(() => {
    if (!inChat || typeof document === 'undefined') return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [inChat]);

  if (!thread) return null;

  return (
    <div className={`thread-workspace${inChat ? ' thread-workspace--chat' : ' thread-workspace--photos'}`}>
      <style>{`
        .thread-workspace { display: grid; gap: 12px; min-height: 0; }
        .thread-workspace--photos {
          background: #000;
          border-radius: 20px;
          padding: 14px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .thread-workspace--chat {
          /* chat renders in a body portal so composer isn't clipped by bottom nav */
        }
        .thread-workspace-head { display: grid; gap: 8px; }
        .thread-chat-overlay {
          position: fixed;
          inset: 0;
          z-index: 1400;
          background: #000;
          display: grid;
          grid-template-rows: auto 1fr;
          min-height: 100dvh;
          height: 100dvh;
          max-height: 100dvh;
        }
        .thread-chat-overlay-head {
          display: grid;
          gap: 8px;
          padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: #0a0a0a;
        }
        .thread-workspace-toprow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .thread-workspace-back {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.12);
          background: #141414;
          color: #f4f4f5;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          width: fit-content;
        }
        .thread-workspace-title { font-size: 22px; font-weight: 900; color: #fafafa; }
        .thread-chat-overlay .thread-workspace-title { font-size: 16px; }
        .thread-mode-switch {
          display: inline-grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: #111;
          width: min(100%, 280px);
        }
        .thread-mode-btn {
          appearance: none;
          border: none;
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: transparent;
          color: #a1a1aa;
          font-family: inherit;
        }
        .thread-mode-btn.is-active {
          background: #fafafa;
          color: #09090b;
        }
        .thread-workspace-path {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          font-size: 12px;
          color: #a1a1aa;
          font-weight: 700;
        }
        .thread-workspace-path button {
          appearance: none;
          border: none;
          background: transparent;
          color: #e4e4e7;
          cursor: pointer;
          font: inherit;
          padding: 0;
        }
        .thread-explorer {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: #0a0a0a;
          min-height: 320px;
          display: grid;
          grid-template-rows: auto 1fr;
          overflow: hidden;
        }
        .thread-explorer-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 11px;
          color: #a1a1aa;
          font-weight: 700;
        }
        .thread-explorer-body {
          padding: 12px;
          overflow: auto;
          min-height: 260px;
        }
        .thread-explorer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
          gap: 10px;
        }
        .thread-explorer-item {
          appearance: none;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 12px;
          padding: 8px 6px;
          cursor: pointer;
          color: inherit;
          font-family: inherit;
          display: grid;
          gap: 6px;
          justify-items: center;
          text-align: center;
        }
        .thread-explorer-item:hover { background: rgba(255,255,255,0.06); }
        .thread-explorer-item.is-selected {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.18);
        }
        .thread-explorer-icon {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          font-size: 28px;
          background: #141414;
          overflow: hidden;
        }
        .thread-explorer-icon img,
        .thread-explorer-icon video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .thread-explorer-label {
          font-size: 11px;
          font-weight: 700;
          color: #e2e8f0;
          line-height: 1.3;
          word-break: break-word;
        }
        .thread-explorer-empty {
          min-height: 220px;
          display: grid;
          place-items: center;
          text-align: center;
          gap: 8px;
          color: #a1a1aa;
          font-size: 13px;
          padding: 20px;
        }
        .thread-explorer-menu {
          position: fixed;
          z-index: 50;
          min-width: 190px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: #0a0a0a;
          box-shadow: 0 18px 40px rgba(0,0,0,0.65);
          padding: 6px;
          display: grid;
          gap: 2px;
        }
        .thread-explorer-menu-item {
          appearance: none;
          border: none;
          background: transparent;
          color: #f4f4f5;
          text-align: left;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .thread-explorer-menu-item:hover { background: rgba(255,255,255,0.08); }
        .thread-explorer-create {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .thread-explorer-create input {
          border: 1px solid rgba(255,255,255,0.12);
          background: #111;
          color: #fafafa;
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 13px;
          min-width: 180px;
          font-family: inherit;
        }
        .thread-explorer-create button {
          border: none;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: #fafafa;
          color: #09090b;
        }
        .thread-chat-shell {
          min-height: 0;
          height: 100%;
          display: grid;
          overflow: hidden;
        }
        .thread-chat-shell .cx-chat,
        .thread-chat-shell .cx-chat--focus,
        .thread-chat-shell .cx-chat--embedded {
          position: relative !important;
          inset: auto !important;
          height: 100% !important;
          min-height: 0 !important;
          max-height: 100% !important;
          border-radius: 0 !important;
          z-index: auto !important;
        }
        .thread-comment-error {
          font-size: 12px;
          color: #fda4af;
          padding: 0 4px;
        }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={handleFilesSelected}
      />

      {inPhotos ? (
        <>
          <div className="thread-workspace-head">
            <div className="thread-workspace-toprow">
              <button
                type="button"
                className="thread-workspace-back"
                onClick={() => onBack?.()}
              >
                ← All threads
              </button>
              <div className="thread-mode-switch" role="tablist" aria-label="Thread mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected
                  className="thread-mode-btn is-active"
                  onClick={() => setThreadMode('photos')}
                >
                  Photos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  className="thread-mode-btn"
                  onClick={() => setThreadMode('chat')}
                >
                  Chat
                </button>
              </div>
            </div>
            <div className="thread-workspace-title">{thread.name}</div>
            <div className="thread-workspace-path">
              <button type="button" onClick={() => goToPathIndex(0)}>Home</button>
              {folderPath.map((folder, index) => (
                <span key={folder.id}>
                  {' / '}
                  <button type="button" onClick={() => goToPathIndex(index + 1)}>{folder.name}</button>
                </span>
              ))}
            </div>
          </div>

          <div className="thread-explorer">
            <div className="thread-explorer-toolbar">
              <span>{pathLabel}{uploadSession?.active && uploadSession.completed + uploadSession.failed < uploadSession.total ? ' · Uploading…' : ''}</span>
              <span>Tap photo to open · Swipe in viewer</span>
            </div>
            <div
              className="thread-explorer-body"
              onContextMenu={(event) => openContextMenu(event, {
                target: 'pane',
                folderId: currentFolder?.id || null,
              })}
            >
              {!currentFolder ? (
                currentFolders.length ? (
                  <div className="thread-explorer-grid">
                    {currentFolders.map((folder) => {
                      const childCount = (folderTree.get(folder.id) || []).length;
                      const mediaCount = (folder.items || []).filter((item) => item.imageId).length;
                      const coverId = (folder.items || []).find((item) => item.imageId)?.imageId;
                      const cover = coverId ? imageById[coverId] : null;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          className={`thread-explorer-item${selectedFolderId === folder.id ? ' is-selected' : ''}`}
                          onClick={() => openFolder(folder)}
                          onContextMenu={(event) => openContextMenu(event, { target: 'folder', folder })}
                        >
                          <div className="thread-explorer-icon">
                            {cover?.imageUrl && !isVideoMedia(cover) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cover.imageUrl} alt="" />
                            ) : (
                              threadEmoji(folder.name)
                            )}
                          </div>
                          <div className="thread-explorer-label">{folder.name}</div>
                          <div className="thread-explorer-label" style={{ color: '#64748b', fontWeight: 600 }}>
                            {mediaCount} files{childCount ? ` · ${childCount} folders` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="thread-explorer-empty">
                    <div style={{ fontSize: 32 }}>📁</div>
                    <div>No folders yet.</div>
                    <div>Right-click here to create a folder.</div>
                  </div>
                )
              ) : (
                <>
                  {(currentFolders.length || currentMedia.length) ? (
                    <div className="thread-explorer-grid">
                      {currentFolders.map((folder) => {
                        const childCount = (folderTree.get(folder.id) || []).length;
                        const mediaCount = (folder.items || []).filter((item) => item.imageId).length;
                        return (
                          <button
                            key={folder.id}
                            type="button"
                            className={`thread-explorer-item${selectedFolderId === folder.id ? ' is-selected' : ''}`}
                            onClick={() => openFolder(folder)}
                            onContextMenu={(event) => openContextMenu(event, { target: 'folder', folder })}
                          >
                            <div className="thread-explorer-icon">{threadEmoji(folder.name)}</div>
                            <div className="thread-explorer-label">{folder.name}</div>
                            <div className="thread-explorer-label" style={{ color: '#64748b', fontWeight: 600 }}>
                              {mediaCount} files{childCount ? ` · ${childCount} folders` : ''}
                            </div>
                          </button>
                        );
                      })}
                      {currentMedia.map((image) => (
                        <button
                          key={image.id}
                          type="button"
                          className="thread-explorer-item"
                          onClick={() => openPhotoAt(image.id)}
                        >
                          <div className="thread-explorer-icon">
                            {isVideoMedia(image) ? (
                              // eslint-disable-next-line jsx-a11y/media-has-caption
                              <video src={image.imageUrl} muted playsInline preload="metadata" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={image.imageUrl} alt={image.caption || ''} />
                            )}
                          </div>
                          <div className="thread-explorer-label">{image.caption?.trim() || (isVideoMedia(image) ? 'Video' : 'Photo')}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="thread-explorer-empty">
                      <div style={{ fontSize: 32 }}>{threadEmoji(currentFolder.name)}</div>
                      <div>{currentFolder.name} is empty.</div>
                      <div>Right-click to upload photos/videos or create a subfolder.</div>
                    </div>
                  )}
                </>
              )}

              {creatingFolder ? (
                <form
                  className="thread-explorer-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitNewFolder(pendingFolderName, creatingFolder.parentId);
                  }}
                >
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{creatingFolder.label}:</span>
                  <input
                    autoFocus
                    value={pendingFolderName}
                    onChange={(event) => setPendingFolderName(event.target.value)}
                    placeholder="Folder name"
                  />
                  <button type="submit">Create</button>
                  <button
                    type="button"
                    className="thread-workspace-back"
                    onClick={() => { setCreatingFolder(null); setPendingFolderName(''); }}
                  >
                    Cancel
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <ExplorerContextMenu
            menu={menu}
            onClose={() => setMenu(null)}
            onAction={handleMenuAction}
          />

          <ThreadUploadProgress
            session={uploadSession}
            onDismiss={() => setUploadSession(null)}
          />

          {commentError ? <div className="thread-comment-error">{commentError}</div> : null}

          {lightboxIndex != null && currentMedia.length ? (
            <ChatMediaLightbox
              theme={theme}
              items={currentMedia}
              startIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onDownload={(item) => {
                if (item?.imageUrl) window.open(item.imageUrl, '_blank', 'noopener,noreferrer');
              }}
              commentDrafts={commentDrafts}
              onCommentDraftChange={(imageId, value) => {
                setCommentDrafts((previous) => ({ ...previous, [imageId]: value }));
              }}
              onPostComment={handlePostComment}
              canComment={canComment}
              postingComment={postingComment}
            />
          ) : null}
        </>
      ) : null}

      {inChat && typeof document !== 'undefined'
        ? createPortal(
          <div className="thread-chat-overlay" role="dialog" aria-modal="true" aria-label={`${thread.name} chat`}>
            <div className="thread-chat-overlay-head">
              <div className="thread-workspace-toprow">
                <button
                  type="button"
                  className="thread-workspace-back"
                  onClick={() => onBack?.()}
                >
                  ← All threads
                </button>
                <div className="thread-mode-switch" role="tablist" aria-label="Thread mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={false}
                    className="thread-mode-btn"
                    onClick={() => setThreadMode('photos')}
                  >
                    Photos
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected
                    className="thread-mode-btn is-active"
                  >
                    Chat
                  </button>
                </div>
              </div>
              <div className="thread-workspace-title">{thread.name}</div>
            </div>
            <div className="thread-chat-shell">
              <ThreadInlineChat
                groupId={thread.id}
                groupName={thread.name}
                username={username}
                userId={userId}
                avatar={avatar}
                theme={theme}
                embedded
              />
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
