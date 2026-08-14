import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildFolderTree } from '../../lib/ChatAlbumGallery';
import { ChatMediaLightbox } from '../../lib/ChatMediaLightbox';
import ThreadInlineChat from '../../lib/ThreadInlineChat';
import { createUploadSession, ThreadUploadProgress } from '../../lib/ThreadUploadProgress';
import { THREAD_WALLPAPERS, resolveThreadWallpaper } from '../../lib/threadWallpapers';

function threadEmoji(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('cricket')) return 'ðŸ';
  if (lower.includes('football') || lower.includes('soccer')) return 'âš½';
  if (lower.includes('goa') || lower.includes('beach')) return 'ðŸ–ï¸';
  if (lower.includes('family')) return 'ðŸ‘¨â€ðŸ‘©â€ðŸ‘§';
  if (lower.includes('day')) return 'ðŸ“…';
  if (lower.includes('trip') || lower.includes('travel')) return 'ðŸ”ï¸';
  return 'ðŸ“';
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
  onUpdateWallpaper,
}) {
  const [threadMode, setThreadMode] = useState('chat'); // chat | photos
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
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [savingWallpaper, setSavingWallpaper] = useState(false);
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
    setThreadMode('chat');
    setWallpaperOpen(false);
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

  const swipePhotos = useMemo(() => {
    if (currentMedia.length) return currentMedia;
    return (thread?.images || []).filter((image) => image?.imageUrl);
  }, [currentMedia, thread?.images]);

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
    const idx = swipePhotos.findIndex((image) => image.id === imageId);
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
  const wallpaperStyle = resolveThreadWallpaper(thread);
  const canEditLook = useMemo(() => {
    const membership = (thread?.memberships || []).find(
      (entry) => String(entry.username || '').toLowerCase() === String(username || '').toLowerCase(),
    );
    if (!membership) return false;
    return membership.role === 'owner' || membership.role === 'admin' || membership.canInvite === true;
  }, [thread?.memberships, username]);

  const handleWorkspaceBack = useCallback(() => {
    if (lightboxIndex != null) {
      setLightboxIndex(null);
      return;
    }
    if (wallpaperOpen) {
      setWallpaperOpen(false);
      return;
    }
    if (menu) {
      setMenu(null);
      return;
    }
    if (creatingFolder) {
      setCreatingFolder(null);
      setPendingFolderName('');
      return;
    }
    if (inPhotos && folderPath.length) {
      goToPathIndex(folderPath.length - 1);
      return;
    }
    if (inPhotos) {
      setThreadMode('chat');
      return;
    }
    onBack?.();
  }, [creatingFolder, folderPath.length, inPhotos, lightboxIndex, menu, onBack, wallpaperOpen]);

  async function applyWallpaper(wallpaperUrl) {
    if (!onUpdateWallpaper) return;
    setSavingWallpaper(true);
    try {
      await onUpdateWallpaper(wallpaperUrl);
      setWallpaperOpen(false);
    } finally {
      setSavingWallpaper(false);
    }
  }

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') handleWorkspaceBack();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleWorkspaceBack]);

  if (!thread || typeof document === 'undefined') return null;

  const backLabel = wallpaperOpen
    ? 'â† Back'
    : (inPhotos && folderPath.length)
      ? 'â† Back'
      : inPhotos
        ? 'â† Chat'
        : 'â† Threads';
  const wallpaperPhotos = (thread.images || []).filter((image) => image?.imageUrl && !isVideoMedia(image)).slice(0, 12);

  return createPortal(
    <div className="thread-phone" role="dialog" aria-modal="true" aria-label={thread.name} style={wallpaperStyle}>
      <style>{`
        .thread-phone {
          position: fixed;
          inset: 0;
          z-index: 1400;
          display: grid;
          grid-template-rows: auto 1fr;
          min-height: 100dvh;
          height: 100dvh;
          max-height: 100dvh;
          background-repeat: no-repeat;
          background-size: cover;
          background-position: center;
          color: #f8fafc;
        }
        .thread-phone-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: calc(8px + env(safe-area-inset-top, 0px)) 10px 8px;
          background: linear-gradient(180deg, rgba(2,6,23,0.78), rgba(2,6,23,0.28));
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .thread-phone-back {
          appearance: none;
          border: none;
          background: rgba(255,255,255,0.14);
          color: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          flex-shrink: 0;
        }
        .thread-phone-title {
          flex: 1;
          min-width: 0;
          font-size: 16px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .thread-phone-icon {
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 12px;
          background: rgba(255,255,255,0.12);
          color: #fff;
          cursor: pointer;
          font-size: 16px;
        }
        .thread-phone-icon.is-active {
          background: #fafafa;
          color: #09090b;
        }
        .thread-phone-body {
          min-height: 0;
          display: grid;
          overflow: hidden;
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
          background: transparent !important;
          border: none !important;
        }
        .thread-photos {
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          min-height: 0;
          overflow: hidden;
        }
        .thread-photo-film {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 10px 12px 6px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .thread-photo-card {
          flex: 0 0 min(78vw, 320px);
          height: 42vh;
          max-height: 360px;
          border: none;
          padding: 0;
          border-radius: 18px;
          overflow: hidden;
          scroll-snap-align: center;
          background: rgba(0,0,0,0.35);
          cursor: pointer;
        }
        .thread-photo-card img,
        .thread-photo-card video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          pointer-events: none;
        }
        .thread-photos-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 4px 12px 8px;
          font-size: 12px;
          color: rgba(226,232,240,0.8);
          font-weight: 700;
        }
        .thread-photos-toolbar button {
          appearance: none;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          cursor: pointer;
          padding: 0;
        }
        .thread-explorer-body {
          padding: 0 10px 16px;
          overflow: auto;
          min-height: 0;
        }
        .thread-explorer-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
        }
        .thread-explorer-item {
          appearance: none;
          border: none;
          background: rgba(15,23,42,0.45);
          padding: 0;
          cursor: pointer;
          color: inherit;
          font-family: inherit;
          aspect-ratio: 1;
          overflow: hidden;
          border-radius: 8px;
        }
        .thread-explorer-icon {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 28px;
          overflow: hidden;
        }
        .thread-explorer-icon img,
        .thread-explorer-icon video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .thread-explorer-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          text-align: center;
          gap: 8px;
          color: #cbd5e1;
          font-size: 13px;
          padding: 20px;
        }
        .thread-explorer-menu {
          position: fixed;
          z-index: 1500;
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
          min-width: 160px;
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
        .thread-wallpaper-sheet {
          position: absolute;
          inset: auto 0 0 0;
          z-index: 6;
          background: rgba(8,12,22,0.96);
          border-top: 1px solid rgba(255,255,255,0.1);
          border-radius: 22px 22px 0 0;
          padding: 14px 14px calc(16px + env(safe-area-inset-bottom, 0px));
          display: grid;
          gap: 12px;
          max-height: 72dvh;
          overflow: auto;
        }
        .thread-wallpaper-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .thread-wallpaper-tile {
          border: 2px solid transparent;
          border-radius: 14px;
          height: 72px;
          cursor: pointer;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          display: grid;
          align-content: end;
          padding: 8px;
          text-align: left;
        }
        .thread-wallpaper-tile.is-active { border-color: #fff; }
        .thread-comment-error {
          font-size: 12px;
          color: #fda4af;
          padding: 0 12px;
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

      <header className="thread-phone-head">
        <button type="button" className="thread-phone-back" onClick={handleWorkspaceBack}>
          {backLabel}
        </button>
        <div className="thread-phone-title">{thread.name}</div>
        {canEditLook ? (
          <button type="button" className={`thread-phone-icon${wallpaperOpen ? ' is-active' : ''}`} onClick={() => setWallpaperOpen((open) => !open)} title="Wallpaper" aria-label="Change wallpaper">
            ðŸŽ¨
          </button>
        ) : null}
        <button
          type="button"
          className={`thread-phone-icon${inPhotos ? ' is-active' : ''}`}
          onClick={() => setThreadMode(inPhotos ? 'chat' : 'photos')}
          title={inPhotos ? 'Chat' : 'Photos'}
          aria-label={inPhotos ? 'Open chat' : 'Open photos'}
        >
          {inPhotos ? 'ðŸ’¬' : 'ðŸ–¼'}
        </button>
      </header>

      <div className="thread-phone-body">
        {inPhotos ? (
          <div className="thread-photos">
            {swipePhotos.length ? (
              <div className="thread-photo-film">
                {swipePhotos.map((image) => (
                  <button key={image.id} type="button" className="thread-photo-card" onClick={() => openPhotoAt(image.id)}>
                    {isVideoMedia(image) ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={image.imageUrl} muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.imageUrl} alt={image.caption || ''} />
                    )}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="thread-photos-toolbar">
              <span>
                <button type="button" onClick={() => goToPathIndex(0)}>Home</button>
                {folderPath.map((folder, index) => (
                  <span key={folder.id}>
                    {' / '}
                    <button type="button" onClick={() => goToPathIndex(index + 1)}>{folder.name}</button>
                  </span>
                ))}
              </span>
              <span>{pathLabel}{uploadSession?.active && uploadSession.completed + uploadSession.failed < uploadSession.total ? ' Â· Uploadingâ€¦' : ''}</span>
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
                      const coverId = (folder.items || []).find((item) => item.imageId)?.imageId;
                      const cover = coverId ? imageById[coverId] : null;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          className="thread-explorer-item"
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
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="thread-explorer-empty">
                    <div style={{ fontSize: 32 }}>ðŸ“</div>
                    <div>No albums yet. Long-press to create a folder.</div>
                  </div>
                )
              ) : (
                <>
                  {(currentFolders.length || currentMedia.length) ? (
                    <div className="thread-explorer-grid">
                      {currentFolders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          className="thread-explorer-item"
                          onClick={() => openFolder(folder)}
                          onContextMenu={(event) => openContextMenu(event, { target: 'folder', folder })}
                        >
                          <div className="thread-explorer-icon">{threadEmoji(folder.name)}</div>
                        </button>
                      ))}
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
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="thread-explorer-empty">
                      <div style={{ fontSize: 32 }}>{threadEmoji(currentFolder.name)}</div>
                      <div>{currentFolder.name} is empty.</div>
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
                  <input
                    autoFocus
                    value={pendingFolderName}
                    onChange={(event) => setPendingFolderName(event.target.value)}
                    placeholder="Folder name"
                  />
                  <button type="submit">Create</button>
                </form>
              ) : null}
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {wallpaperOpen ? (
        <div className="thread-wallpaper-sheet">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Chat wallpaper</strong>
            <button type="button" className="thread-phone-back" onClick={() => setWallpaperOpen(false)}>Done</button>
          </div>
          <div className="thread-wallpaper-grid">
            {THREAD_WALLPAPERS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`thread-wallpaper-tile${thread.wallpaperUrl === preset.id ? ' is-active' : ''}`}
                style={{ background: preset.css }}
                disabled={savingWallpaper}
                onClick={() => void applyWallpaper(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {wallpaperPhotos.length ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>From this thread</div>
              <div className="thread-wallpaper-grid">
                {wallpaperPhotos.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className={`thread-wallpaper-tile${thread.wallpaperUrl === image.imageUrl ? ' is-active' : ''}`}
                    style={{
                      backgroundImage: `url("${image.imageUrl}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    disabled={savingWallpaper}
                    onClick={() => void applyWallpaper(image.imageUrl)}
                  />
                ))}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="thread-phone-back"
            disabled={savingWallpaper}
            onClick={() => void applyWallpaper('')}
          >
            Use default
          </button>
        </div>
      ) : null}

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

      {lightboxIndex != null && swipePhotos.length ? (
        <ChatMediaLightbox
          theme={theme}
          items={swipePhotos}
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
    </div>,
    document.body,
  );
}
