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
  if (lower.includes('family')) return '👨‍👩‍👧';
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
  commentDrafts = {},
  onCommentDraftChange,
  onPostComment,
  canComment = false,
}) {
  const [albumPath, setAlbumPath] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [showCreateForm, setShowCreateForm] = useState(false);
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
    if (currentFolder) {
      onSelectUploadFolder(currentFolder.id);
      onPickFiles();
      return;
    }
    if (selectedUploadFolderId) {
      onPickFiles();
      return;
    }
    if (folders.length === 1) {
      onSelectUploadFolder(folders[0].id);
      onPickFiles();
    }
  };

  const handleCreateSubmit = (event) => {
    onCreateFolder(event, currentParentId);
    setShowCreateForm(false);
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
        .chat-album-media-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .chat-album-media-tile {
          border: none;
          padding: 0;
          background: transparent;
          cursor: pointer;
          position: relative;
          border-radius: 12px;
          overflow: hidden;
        }
        .chat-album-media-grid img,
        .chat-album-media-grid video {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.22);
          display: block;
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
        .chat-album-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chat-album-nav-btn {
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.06);
          color: inherit;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
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
          .chat-album-media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 721px) {
          .chat-album-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>

      <div className="chat-album-root">
        <div className="chat-album-nav">
          {inAlbumView ? (
            <button type="button" className="chat-album-nav-btn" onClick={goUpOneLevel}>
              ← Albums{albumPath.length > 1 ? ` / ${albumPath[albumPath.length - 2].name}` : ''}
            </button>
          ) : (
            <span style={{ fontSize: compact ? '14px' : '15px', fontWeight: 800, color: theme.textHeading }}>
              Albums
            </span>
          )}
          {inAlbumView && currentFolder ? (
            <span style={{ fontSize: '13px', fontWeight: 800, color: theme.textHeading, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentFolder.name}
            </span>
          ) : null}
        </div>

        {!compact ? (
          <p style={{ margin: 0, fontSize: '12px', color: theme.textSecondary, lineHeight: 1.45 }}>
            Tap an album to see photos. Use the buttons below to add albums or upload.
          </p>
        ) : null}

        <div className="chat-album-scroll">
          {!inAlbumView ? (
            <>
              {currentFolders.length ? (
                <div className="chat-album-grid">
                  {currentFolders.map((folder) => {
                    const cover = folderCoverMap[folder.id];
                    const childCount = (folderTree.get(folder.id) || []).length;
                    const mediaCount = (folder.items || []).filter((item) => item.imageId).length;
                    return (
                      <button key={folder.id} type="button" className="chat-album-card" onClick={() => openAlbum(folder)}>
                        <div className="chat-album-cover" style={{ background: albumGradient(folder.name) }}>
                          {cover?.imageUrl ? <img src={cover.imageUrl} alt="" /> : null}
                          <div className="chat-album-cover-content">
                            <div style={{ fontSize: '22px' }}>{albumEmoji(folder.name)}</div>
                            <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>{folder.name}</div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.82)' }}>
                              {mediaCount} photo{mediaCount === 1 ? '' : 's'}{childCount ? ` · ${childCount} inside` : ''}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '20px 12px', borderRadius: '14px', border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, fontSize: '13px', textAlign: 'center', lineHeight: 1.5 }}>
                  No albums yet.{canManage ? ' Tap “New album” below to create one.' : ''}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>{folderImages.length} item{folderImages.length === 1 ? '' : 's'}</span>
                {onShareFolder ? (
                  <button type="button" onClick={() => onShareFolder(currentFolder)} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: '999px', padding: '6px 11px', background: theme.panelBg, color: theme.textPrimary, fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                    Share
                  </button>
                ) : null}
              </div>

              {(folderTree.get(currentFolder.id) || []).length > 0 ? (
                <div className="chat-album-grid">
                  {(folderTree.get(currentFolder.id) || []).map((folder) => {
                    const cover = folderCoverMap[folder.id];
                    const mediaCount = (folder.items || []).filter((item) => item.imageId).length;
                    return (
                      <button key={folder.id} type="button" className="chat-album-card" onClick={() => openAlbum(folder)}>
                        <div className="chat-album-cover" style={{ background: albumGradient(folder.name), minHeight: '80px' }}>
                          {cover?.imageUrl ? <img src={cover.imageUrl} alt="" /> : null}
                          <div className="chat-album-cover-content">
                            <div style={{ fontSize: '18px' }}>{albumEmoji(folder.name)}</div>
                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#fff' }}>{folder.name}</div>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.82)' }}>{mediaCount} photo{mediaCount === 1 ? '' : 's'}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {folderImages.length ? (
                <div className="chat-album-media-grid">
                  {folderImages.map((image, imageIndex) => (
                    <button key={image.id} type="button" className="chat-album-media-tile" onClick={() => setLightboxIndex(imageIndex)}>
                      {isVideoMedia(image) ? (
                        <>
                          <video src={image.imageUrl} muted playsInline preload="metadata" />
                          <span className="chat-album-media-badge">▶</span>
                        </>
                      ) : (
                        <img src={image.imageUrl} alt={image.caption || 'Photo'} />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '16px 8px', lineHeight: 1.5 }}>
                  No photos here yet.{canManage ? ' Tap Upload below.' : ''}
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

        {canManage ? (
          <div className={`chat-album-actions${compact ? ' chat-album-actions--sticky' : ''}`}>
            {!inAlbumView ? (
              <>
                <button
                  type="button"
                  style={{ ...actionBtn, flex: 1, minWidth: '120px', background: theme.cardBg, color: theme.textHeading, border: `1px solid ${theme.cardBorder}` }}
                  onClick={() => setShowCreateForm((open) => !open)}
                >
                  {showCreateForm ? 'Close' : '+ New album'}
                </button>
                {folders.length > 0 ? (
                  <button
                    type="button"
                    style={{ ...actionBtn, flex: 1, minWidth: '120px', background: theme.blue, color: '#fff' }}
                    onClick={handleUploadClick}
                  >
                    Upload
                  </button>
                ) : null}
              </>
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
