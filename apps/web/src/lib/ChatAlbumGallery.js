import { useMemo, useState } from 'react';
import { ChatMediaLightbox } from './ChatMediaLightbox';

const ALBUM_GRADIENTS = [
  ['#6366f1', '#ec4899'],
  ['#0ea5e9', '#22c55e'],
  ['#f97316', '#eab308'],
  ['#a855f7', '#3b82f6'],
  ['#14b8a6', '#06b6d4'],
  ['#ef4444', '#f59e0b'],
];

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function albumGradient(name) {
  const pair = ALBUM_GRADIENTS[hashString(name) % ALBUM_GRADIENTS.length];
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
}

function albumEmoji(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('goa') || lower.includes('beach')) return '🏖️';
  if (lower.includes('family')) return '👨‍👩‍👧';
  if (lower.includes('day 1') || lower.includes('day1')) return '🌅';
  if (lower.includes('ooty') || lower.includes('trip') || lower.includes('travel')) return '🏔️';
  if (lower.includes('wedding')) return '💒';
  if (lower.includes('party')) return '🎉';
  if (lower.includes('video')) return '🎬';
  return '📁';
}

function isVideoMedia(image) {
  if (!image) return false;
  if (image.mediaType === 'video') return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(image.imageUrl || image.s3Key || ''));
}

function isFolderDescendant(folders, ancestorId, candidateParentId) {
  let current = candidateParentId;
  const seen = new Set();
  while (current) {
    if (current === ancestorId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    const folder = folders.find((entry) => entry.id === current);
    current = folder?.parentFolderId || null;
  }
  return false;
}

export function buildFolderTree(folders = []) {
  const byParent = new Map();
  folders.forEach((folder) => {
    const parentKey = folder.parentFolderId || null;
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey).push(folder);
  });
  byParent.forEach((list) => list.sort((left, right) => left.name.localeCompare(right.name)));
  return byParent;
}

export function ChatAlbumGallery({
  theme,
  folders = [],
  images = [],
  canManage = false,
  compact = false,
  folderForm,
  onFolderFormChange,
  onCreateFolder,
  selectedUploadFolderId,
  onSelectUploadFolder,
  imageCaption,
  onImageCaptionChange,
  onPickFiles,
  onDownloadImage,
  onShareFolder,
  onMoveFolder,
  commentDrafts = {},
  onCommentDraftChange,
  onPostComment,
  canComment = false,
}) {
  const [albumPath, setAlbumPath] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draggingFolderId, setDraggingFolderId] = useState('');
  const [dropFolderTargetId, setDropFolderTargetId] = useState('');
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const currentParentId = albumPath.length ? albumPath[albumPath.length - 1].id : null;
  const currentFolders = folderTree.get(currentParentId) || [];
  const currentFolder = albumPath.length ? albumPath[albumPath.length - 1] : null;
  const inAlbumView = Boolean(currentFolder);

  const imageById = useMemo(
    () => Object.fromEntries((images || []).map((image) => [image.id, image])),
    [images],
  );

  const folderImages = useMemo(() => {
    if (!currentFolder) return [];
    const imageIds = new Set(
      (currentFolder.items || [])
        .filter((item) => item.imageId)
        .map((item) => item.imageId),
    );
    return (images || []).filter((image) => imageIds.has(image.id));
  }, [currentFolder, images]);

  const folderCoverMap = useMemo(() => {
    const map = {};
    folders.forEach((folder) => {
      const firstImageId = (folder.items || []).find((item) => item.imageId)?.imageId;
      map[folder.id] = firstImageId ? imageById[firstImageId] : null;
    });
    return map;
  }, [folders, imageById]);

  const goToAlbumList = () => {
    setAlbumPath([]);
    setShowCreateForm(false);
    setLightboxIndex(-1);
  };

  const goUpOneLevel = () => {
    setAlbumPath((path) => path.slice(0, -1));
    setShowCreateForm(false);
    setLightboxIndex(-1);
  };

  const openAlbum = (folder) => {
    setAlbumPath((path) => [...path, folder]);
    setShowCreateForm(false);
    setLightboxIndex(-1);
    if (canManage) onSelectUploadFolder(folder.id);
  };

  const handleUploadClick = () => {
    if (!currentFolder) return;
    onSelectUploadFolder(currentFolder.id);
    onPickFiles();
  };

  const handleCreateSubmit = (event) => {
    onCreateFolder(event, currentParentId);
    setShowCreateForm(false);
  };

  const handleDropOnFolder = (targetFolderId) => {
    if (!draggingFolderId || !onMoveFolder) return;
    if (draggingFolderId === targetFolderId) return;
    if (isFolderDescendant(folders, draggingFolderId, targetFolderId)) return;
    onMoveFolder(draggingFolderId, targetFolderId);
    setDraggingFolderId('');
    setDropFolderTargetId('');
  };

  const handleDropOnAlbumRoot = () => {
    if (!draggingFolderId || !onMoveFolder) return;
    onMoveFolder(draggingFolderId, null);
    setDraggingFolderId('');
    setDropFolderTargetId('');
  };

  const renderFolderCard = (folder, { compactCard = false } = {}) => {
    const cover = folderCoverMap[folder.id];
    const childCount = (folderTree.get(folder.id) || []).length;
    const mediaCount = (folder.items || []).filter((item) => item.imageId).length;
    const canDrop = draggingFolderId
      && draggingFolderId !== folder.id
      && !isFolderDescendant(folders, draggingFolderId, folder.id);

    return (
      <div
        key={folder.id}
        className={`chat-album-folder-wrap${draggingFolderId === folder.id ? ' is-dragging' : ''}${dropFolderTargetId === folder.id ? ' is-drop-target' : ''}`}
        onDragOver={(event) => {
          if (!canDrop) return;
          event.preventDefault();
          setDropFolderTargetId(folder.id);
        }}
        onDragLeave={() => { if (dropFolderTargetId === folder.id) setDropFolderTargetId(''); }}
        onDrop={(event) => { event.preventDefault(); handleDropOnFolder(folder.id); }}
      >
        {canManage && onMoveFolder ? (
          <button
            type="button"
            className="chat-album-drag-handle"
            draggable
            aria-label={`Move ${folder.name}`}
            onDragStart={() => setDraggingFolderId(folder.id)}
            onDragEnd={() => { setDraggingFolderId(''); setDropFolderTargetId(''); }}
            onClick={(event) => event.stopPropagation()}
          >
            ⋮⋮
          </button>
        ) : null}
        <button type="button" className="chat-album-card" onClick={() => openAlbum(folder)}>
          <div className="chat-album-cover" style={{ background: albumGradient(folder.name), minHeight: compactCard ? '80px' : undefined }}>
            {cover?.imageUrl ? <img src={cover.imageUrl} alt="" /> : null}
            <div className="chat-album-cover-content">
              <div style={{ fontSize: compactCard ? '18px' : '22px' }}>{albumEmoji(folder.name)}</div>
              <div style={{ fontSize: compactCard ? '13px' : '14px', fontWeight: 900, color: '#fff' }}>{folder.name}</div>
              <div style={{ fontSize: compactCard ? '10px' : '11px', color: 'rgba(255,255,255,0.82)' }}>
                {mediaCount} photo{mediaCount === 1 ? '' : 's'}{childCount ? ` · ${childCount} inside` : ''}
              </div>
            </div>
          </div>
        </button>
      </div>
    );
  };

  const actionBtn = {
    border: 'none',
    borderRadius: '12px',
    padding: compact ? '12px 14px' : '11px 14px',
    fontWeight: 800,
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: theme.font,
  };

  return (
    <>
      <style>{`
        .chat-album-root {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }
        .chat-album-scroll {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }
        .chat-album-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .chat-album-folder-wrap {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 8px;
          align-items: stretch;
          border-radius: 16px;
          transition: box-shadow 0.15s ease;
        }
        .chat-album-folder-wrap.is-drop-target {
          box-shadow: 0 0 0 2px ${theme.blue}55;
        }
        .chat-album-folder-wrap.is-dragging { opacity: 0.55; }
        .chat-album-drag-handle {
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.06);
          color: inherit;
          border-radius: 12px;
          width: 34px;
          min-height: 64px;
          display: grid;
          place-items: center;
          cursor: grab;
          font-size: 14px;
          align-self: stretch;
        }
        .chat-album-drop-root {
          border: 1px dashed rgba(148,163,184,0.35);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 700;
          color: ${theme.textMuted};
          text-align: center;
        }
        .chat-album-drop-root.is-drop-target {
          border-color: ${theme.blue};
          color: ${theme.blue};
          background: ${theme.blue}12;
        }
        .chat-album-move-hint {
          margin: 0;
          font-size: 11px;
          color: ${theme.textMuted};
          line-height: 1.45;
        }
        .chat-album-card {
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
          border-radius: 16px;
          overflow: hidden;
          background: transparent;
          color: inherit;
          font-family: inherit;
          box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        }
        .chat-album-cover {
          position: relative;
          min-height: ${compact ? '96px' : '118px'};
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 4px;
        }
        .chat-album-cover img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.42;
        }
        .chat-album-cover::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 20%, rgba(2,6,23,0.88));
        }
        .chat-album-cover-content { position: relative; z-index: 1; }
        .chat-album-collage {
          display: grid;
          grid-template-columns: 2fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 6px;
          height: 180px;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 4px;
        }
        .chat-album-collage-main {
          grid-row: span 2;
          border: none;
          padding: 0;
          cursor: pointer;
          overflow: hidden;
          background: #0f172a;
        }
        .chat-album-collage-side {
          border: none;
          padding: 0;
          cursor: pointer;
          overflow: hidden;
          background: #0f172a;
        }
        .chat-album-collage img,
        .chat-album-collage video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.25s ease;
        }
        .chat-album-collage button:hover img,
        .chat-album-collage button:hover video { transform: scale(1.04); }
        .chat-album-masonry {
          column-count: 2;
          column-gap: 8px;
        }
        .chat-album-masonry .chat-album-media-tile {
          break-inside: avoid;
          margin-bottom: 8px;
          width: 100%;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(0,0,0,0.15);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .chat-album-masonry .chat-album-media-tile:active { transform: scale(0.98); }
        .chat-album-media-tile {
          border: none;
          padding: 0;
          background: transparent;
          cursor: pointer;
          position: relative;
          border-radius: 12px;
          overflow: hidden;
        }
        .chat-album-masonry img,
        .chat-album-masonry video {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(15,23,42,0.5);
        }
        .chat-album-media-badge {
          position: absolute;
          right: 6px;
          bottom: 6px;
          border-radius: 999px;
          padding: 3px 7px;
          font-size: 9px;
          font-weight: 800;
          background: rgba(2,6,23,0.72);
          color: #fff;
        }
        .chat-album-header {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-shrink: 0;
          padding-bottom: 2px;
        }
        .chat-album-header-title {
          flex: 1;
          min-width: 0;
          display: grid;
          gap: 1px;
        }
        .chat-album-header-name {
          font-size: 15px;
          font-weight: 900;
          color: ${theme.textHeading};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.2;
        }
        .chat-album-header-meta {
          font-size: 11px;
          color: ${theme.textMuted};
          line-height: 1.2;
        }
        .chat-album-header-tools {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .chat-album-icon-btn {
          width: 32px;
          height: 32px;
          border: 1px solid ${theme.cardBorder};
          background: ${theme.cardBg};
          color: ${theme.textSecondary};
          border-radius: 10px;
          font-size: 15px;
          line-height: 1;
          display: grid;
          place-items: center;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          flex-shrink: 0;
        }
        .chat-album-icon-btn--active {
          background: ${theme.blue}22;
          border-color: ${theme.blue};
          color: ${theme.blue};
        }
        .chat-album-icon-btn--accent {
          background: ${theme.orange}18;
          border-color: ${theme.orange};
          color: ${theme.orange};
        }
        .chat-album-icon-btn--primary {
          background: ${theme.blue};
          border-color: ${theme.blue};
          color: #fff;
        }
        .chat-album-photo-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .chat-album-photo-grid .chat-album-media-tile {
          aspect-ratio: 1;
          margin: 0;
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: none;
        }
        .chat-album-photo-grid img,
        .chat-album-photo-grid video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 12px;
          border: none;
          background: ${theme.cardBg};
        }
        .chat-album-root--compact .chat-album-scroll {
          gap: 10px;
        }
        .chat-album-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chat-album-actions--sticky {
          position: sticky;
          bottom: 0;
          z-index: 2;
          padding-top: 8px;
          margin-top: 4px;
          background: linear-gradient(180deg, transparent, ${theme.panelBg} 28%);
        }
        .chat-album-create {
          display: grid;
          gap: 8px;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.25);
          background: ${theme.cardBg};
        }
        @media (max-width: 720px) {
          .chat-album-grid { grid-template-columns: 1fr; }
          .chat-album-masonry { column-count: 2; }
          .chat-album-root--compact .chat-album-collage { display: none; }
        }
        @media (min-width: 721px) {
          .chat-album-masonry { column-count: 3; }
        }
        @media (min-width: 721px) {
          .chat-album-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>

      <div className={`chat-album-root${compact ? ' chat-album-root--compact' : ''}`}>
        <div className="chat-album-header">
          {inAlbumView ? (
            <button type="button" className="chat-album-icon-btn" onClick={goUpOneLevel} aria-label="Back" title="Back">
              ←
            </button>
          ) : null}
          <div className="chat-album-header-title">
            <span className="chat-album-header-name">
              {inAlbumView && currentFolder ? currentFolder.name : 'Albums'}
            </span>
            {inAlbumView ? (
              <span className="chat-album-header-meta">
                {folderImages.length} photo{folderImages.length === 1 ? '' : 's'}
                {(folderTree.get(currentFolder?.id) || []).length
                  ? ` · ${(folderTree.get(currentFolder.id) || []).length} folder${(folderTree.get(currentFolder.id) || []).length === 1 ? '' : 's'}`
                  : ''}
              </span>
            ) : (
              <span className="chat-album-header-meta">{currentFolders.length} album{currentFolders.length === 1 ? '' : 's'}</span>
            )}
          </div>
          <div className="chat-album-header-tools">
            {inAlbumView && onShareFolder ? (
              <button
                type="button"
                className="chat-album-icon-btn"
                onClick={() => onShareFolder(currentFolder)}
                aria-label="Share album"
                title="Share"
              >
                🔗
              </button>
            ) : null}
            {canManage && compact ? (
              inAlbumView ? (
                <>
                  <button
                    type="button"
                    className={`chat-album-icon-btn${showCreateForm ? ' chat-album-icon-btn--active' : ''}`}
                    onClick={() => setShowCreateForm((open) => !open)}
                    aria-label={showCreateForm ? 'Close folder form' : 'New folder'}
                    title={showCreateForm ? 'Close' : 'New folder'}
                  >
                    {showCreateForm ? '✕' : '📁'}
                  </button>
                  <button
                    type="button"
                    className="chat-album-icon-btn chat-album-icon-btn--accent"
                    onClick={handleUploadClick}
                    aria-label="Upload photos"
                    title="Upload"
                  >
                    📷
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`chat-album-icon-btn chat-album-icon-btn--primary${showCreateForm ? ' chat-album-icon-btn--active' : ''}`}
                  onClick={() => setShowCreateForm((open) => !open)}
                  aria-label={showCreateForm ? 'Close album form' : 'New album'}
                  title={showCreateForm ? 'Close' : 'New album'}
                >
                  {showCreateForm ? '✕' : '➕'}
                </button>
              )
            ) : null}
          </div>
        </div>

        {!compact ? (
          <p className="chat-album-move-hint">
            Tap an album to see photos. Drag ⋮⋮ onto another album to nest folders (Goa → Day 1).
          </p>
        ) : null}

        <div className="chat-album-scroll">
          {!inAlbumView ? (
            <>
              {draggingFolderId && canManage && onMoveFolder ? (
                <div
                  className={`chat-album-drop-root${dropFolderTargetId === '__root__' ? ' is-drop-target' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setDropFolderTargetId('__root__'); }}
                  onDragLeave={() => { if (dropFolderTargetId === '__root__') setDropFolderTargetId(''); }}
                  onDrop={(event) => { event.preventDefault(); handleDropOnAlbumRoot(); }}
                >
                  ↥ Drop here for top-level album
                </div>
              ) : null}
              {currentFolders.length ? (
                <div className="chat-album-grid">
                  {currentFolders.map((folder) => renderFolderCard(folder))}
                </div>
              ) : (
                <div style={{ padding: '20px 12px', borderRadius: '14px', border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, fontSize: '13px', textAlign: 'center', lineHeight: 1.5 }}>
                  No albums yet.{canManage ? ` Tap “${compact ? '+ New album' : 'New album'}” to create one.` : ''}
                </div>
              )}

              {showCreateForm && canManage ? (
                <form className="chat-album-create" onSubmit={handleCreateSubmit}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: theme.textHeading }}>New album name</div>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary, fontSize: '14px' }}
                    value={folderForm.name}
                    onChange={(e) => onFolderFormChange({ ...folderForm, name: e.target.value })}
                    placeholder="e.g. Family, Ooty trip"
                    autoFocus
                  />
                  {!compact ? (
                    <input
                      style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary, fontSize: '13px' }}
                      value={folderForm.description}
                      onChange={(e) => onFolderFormChange({ ...folderForm, description: e.target.value })}
                      placeholder="Optional note"
                    />
                  ) : null}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" style={{ ...actionBtn, flex: 1, background: theme.cardBg, color: theme.textSecondary, border: `1px solid ${theme.cardBorder}` }} onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" style={{ ...actionBtn, flex: 1, background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`, color: '#fff' }}>
                      Save
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <>
              {!compact && onShareFolder ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="chat-album-icon-btn"
                    onClick={() => onShareFolder(currentFolder)}
                    aria-label="Share album"
                    title="Share"
                  >
                    🔗
                  </button>
                </div>
              ) : null}

              {draggingFolderId && canManage && onMoveFolder ? (
                <div
                  className={`chat-album-drop-root${dropFolderTargetId === '__parent__' ? ' is-drop-target' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setDropFolderTargetId('__parent__'); }}
                  onDragLeave={() => { if (dropFolderTargetId === '__parent__') setDropFolderTargetId(''); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const parentId = albumPath.length > 1 ? albumPath[albumPath.length - 2].id : null;
                    if (!onMoveFolder) return;
                    onMoveFolder(draggingFolderId, parentId);
                    setDraggingFolderId('');
                    setDropFolderTargetId('');
                  }}
                >
                  ↥ Drop here to move up one level
                </div>
              ) : null}
              {(folderTree.get(currentFolder.id) || []).length > 0 ? (
                <div className="chat-album-grid">
                  {(folderTree.get(currentFolder.id) || []).map((folder) => renderFolderCard(folder, { compactCard: true }))}
                </div>
              ) : null}

              {folderImages.length ? (
                <>
                  {!compact && folderImages.length >= 3 ? (
                    <div className="chat-album-collage">
                      <button type="button" className="chat-album-collage-main" onClick={() => setLightboxIndex(0)}>
                        {isVideoMedia(folderImages[0]) ? (
                          <video src={folderImages[0].imageUrl} muted playsInline preload="metadata" />
                        ) : (
                          <img src={folderImages[0].imageUrl} alt="" />
                        )}
                      </button>
                      <button type="button" className="chat-album-collage-side" onClick={() => setLightboxIndex(1)}>
                        {isVideoMedia(folderImages[1]) ? (
                          <video src={folderImages[1].imageUrl} muted playsInline preload="metadata" />
                        ) : (
                          <img src={folderImages[1].imageUrl} alt="" />
                        )}
                      </button>
                      <button type="button" className="chat-album-collage-side" onClick={() => setLightboxIndex(2)}>
                        {isVideoMedia(folderImages[2]) ? (
                          <video src={folderImages[2].imageUrl} muted playsInline preload="metadata" />
                        ) : (
                          <img src={folderImages[2].imageUrl} alt="" />
                        )}
                      </button>
                    </div>
                  ) : null}
                  <div className={compact ? 'chat-album-photo-grid' : 'chat-album-masonry'}>
                    {folderImages.map((image, imageIndex) => (
                      <button key={image.id} type="button" className="chat-album-media-tile" onClick={() => setLightboxIndex(imageIndex)}>
                        {isVideoMedia(image) ? (
                          <>
                            <video src={image.imageUrl} muted playsInline preload="metadata" />
                            <span className="chat-album-media-badge">▶</span>
                          </>
                        ) : (
                          <img src={image.imageUrl} alt={image.caption || 'Photo'} loading="lazy" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '16px 8px', lineHeight: 1.5 }}>
                  No photos here yet.{canManage ? ' Tap 📷 to upload.' : ''}
                </div>
              )}

              {showCreateForm && canManage ? (
                <form className="chat-album-create" onSubmit={handleCreateSubmit}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: theme.textHeading }}>New folder inside {currentFolder.name}</div>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary, fontSize: '14px' }}
                    value={folderForm.name}
                    onChange={(e) => onFolderFormChange({ ...folderForm, name: e.target.value })}
                    placeholder="e.g. Day 2"
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" style={{ ...actionBtn, flex: 1, background: theme.cardBg, color: theme.textSecondary, border: `1px solid ${theme.cardBorder}` }} onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" style={{ ...actionBtn, flex: 1, background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`, color: '#fff' }}>
                      Save
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>

        {canManage && !compact ? (
          <div className="chat-album-actions">
            {!inAlbumView ? (
              <button
                type="button"
                style={{ ...actionBtn, flex: 1, minWidth: '120px', background: theme.cardBg, color: theme.textHeading, border: `1px solid ${theme.cardBorder}` }}
                onClick={() => setShowCreateForm((open) => !open)}
              >
                {showCreateForm ? 'Close' : '+ New album'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  style={{ ...actionBtn, flex: 1, background: theme.orange, color: '#fff' }}
                  onClick={handleUploadClick}
                >
                  📷 Upload
                </button>
                <button
                  type="button"
                  style={{ ...actionBtn, background: theme.cardBg, color: theme.textSecondary, border: `1px solid ${theme.cardBorder}` }}
                  onClick={() => setShowCreateForm((open) => !open)}
                >
                  {showCreateForm ? 'Close' : '+ Folder'}
                </button>
              </>
            )}
          </div>
        ) : null}

        {!compact && canManage && !inAlbumView && folders.length > 0 ? (
          <details style={{ fontSize: '12px', color: theme.textMuted }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Upload with caption</summary>
            <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
              <input
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary }}
                value={imageCaption}
                onChange={(e) => onImageCaptionChange(e.target.value)}
                placeholder="Caption (optional)"
              />
            </div>
          </details>
        ) : null}
      </div>

      {lightboxIndex >= 0 && folderImages.length ? (
        <ChatMediaLightbox
          theme={theme}
          items={folderImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(-1)}
          onDownload={onDownloadImage}
          commentDrafts={commentDrafts}
          onCommentDraftChange={onCommentDraftChange}
          onPostComment={onPostComment}
          canComment={canComment}
        />
      ) : null}
    </>
  );
}
