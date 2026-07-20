import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFolderTree } from '../../lib/ChatAlbumGallery';
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
  onBack,
  onCreateFolder,
  onUploadToFolder,
  onRefresh,
}) {
  const [folderPath, setFolderPath] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [menu, setMenu] = useState(null);
  const [pendingFolderName, setPendingFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(null);
  const [uploadSession, setUploadSession] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  useEffect(() => {
    setFolderPath([]);
    setSelectedFolderId('');
    setSelectedMediaId('');
    setMenu(null);
    setCreatingFolder(null);
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

  const pathLabel = ['Home', ...folderPath.map((folder) => folder.name)].join(' / ');

  function openFolder(folder) {
    if (!folder) return;
    setFolderPath((path) => [...path, folder]);
    setSelectedFolderId(folder.id);
    setSelectedMediaId('');
  }

  function goToPathIndex(index) {
    if (index <= 0) {
      setFolderPath([]);
    } else {
      setFolderPath((path) => path.slice(0, index));
    }
    setSelectedMediaId('');
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

  if (!thread) return null;

  return (
    <div className="thread-workspace">
      <style>{`
        .thread-workspace { display: grid; gap: 12px; }
        .thread-workspace-head { display: grid; gap: 8px; }
        .thread-workspace-back {
          appearance: none;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(15,23,42,0.55);
          color: #e2e8f0;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          width: fit-content;
        }
        .thread-workspace-title { font-size: 22px; font-weight: 900; color: #f8fafc; }
        .thread-workspace-path {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          font-size: 12px;
          color: #94a3b8;
          font-weight: 700;
        }
        .thread-workspace-path button {
          appearance: none;
          border: none;
          background: transparent;
          color: #bae6fd;
          cursor: pointer;
          font: inherit;
          padding: 0;
        }
        .thread-explorer {
          border-radius: 18px;
          border: 1px solid rgba(56,189,248,0.16);
          background: rgba(2,6,23,0.35);
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
          border-bottom: 1px solid rgba(148,163,184,0.14);
          font-size: 11px;
          color: #94a3b8;
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
        .thread-explorer-item:hover { background: rgba(56,189,248,0.08); }
        .thread-explorer-item.is-selected {
          background: rgba(56,189,248,0.14);
          border-color: rgba(56,189,248,0.35);
        }
        .thread-explorer-icon {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          font-size: 28px;
          background: rgba(15,23,42,0.8);
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
          color: #94a3b8;
          font-size: 13px;
          padding: 20px;
        }
        .thread-explorer-menu {
          position: fixed;
          z-index: 50;
          min-width: 190px;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.24);
          background: #0f172a;
          box-shadow: 0 18px 40px rgba(0,0,0,0.45);
          padding: 6px;
          display: grid;
          gap: 2px;
        }
        .thread-explorer-menu-item {
          appearance: none;
          border: none;
          background: transparent;
          color: #e2e8f0;
          text-align: left;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .thread-explorer-menu-item:hover { background: rgba(56,189,248,0.12); }
        .thread-explorer-create {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .thread-explorer-create input {
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(2,6,23,0.55);
          color: #f8fafc;
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
          background: linear-gradient(135deg, #38bdf8, #818cf8);
          color: #fff;
        }
        .thread-workspace-chat-toggle {
          appearance: none;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(15,23,42,0.55);
          color: #e2e8f0;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          width: fit-content;
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

      <div className="thread-workspace-head">
        <button type="button" className="thread-workspace-back" onClick={onBack}>← All threads</button>
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
          <span>Click folder to open · Right-click for menu</span>
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
                      className={`thread-explorer-item${selectedMediaId === image.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedMediaId(image.id)}
                      onDoubleClick={() => {
                        if (image.imageUrl) window.open(image.imageUrl, '_blank', 'noopener,noreferrer');
                      }}
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

      <button
        type="button"
        className="thread-workspace-chat-toggle"
        onClick={() => setChatOpen((open) => !open)}
      >
        {chatOpen ? 'Hide conversation ▲' : 'Show conversation ▼'}
      </button>
      {chatOpen ? (
        <ThreadInlineChat
          groupId={thread.id}
          groupName={thread.name}
          username={username}
          theme={theme}
        />
      ) : null}
    </div>
  );
}
