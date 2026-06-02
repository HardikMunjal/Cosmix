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
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const currentParentId = albumPath.length ? albumPath[albumPath.length - 1].id : null;
  const currentFolders = folderTree.get(currentParentId) || [];
  const currentFolder = albumPath.length ? albumPath[albumPath.length - 1] : null;

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

  return (
    <>
      <style>{`
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
          border-radius: 18px;
          overflow: hidden;
          background: transparent;
          color: inherit;
          font-family: inherit;
          box-shadow: 0 12px 28px rgba(0,0,0,0.22);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .chat-album-card:active { transform: scale(0.98); }
        .chat-album-cover {
          position: relative;
          min-height: 118px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 6px;
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
        .chat-album-cover-content {
          position: relative;
          z-index: 1;
        }
        .chat-album-media-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .chat-album-media-grid img,
        .chat-album-media-grid video {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.22);
          display: block;
          background: rgba(15,23,42,0.5);
        }
        .chat-album-media-tile {
          border: none;
          padding: 0;
          background: transparent;
          cursor: pointer;
          position: relative;
          border-radius: 14px;
          overflow: hidden;
        }
        .chat-album-media-tile:hover { transform: scale(1.02); transition: transform 0.15s ease; }
        .chat-album-media-badge {
          position: absolute;
          right: 8px;
          bottom: 8px;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 800;
          background: rgba(2,6,23,0.72);
          color: #fff;
        }
        .chat-album-filmstrip {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
          scroll-snap-type: x mandatory;
        }
        .chat-album-filmstrip img,
        .chat-album-filmstrip video {
          flex: 0 0 120px;
          width: 120px;
          height: 120px;
          object-fit: cover;
          border-radius: 14px;
          scroll-snap-align: start;
          border: 1px solid rgba(148,163,184,0.22);
        }
        .chat-album-breadcrumb {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .chat-album-breadcrumb button {
          border: none;
          background: rgba(255,255,255,0.08);
          color: inherit;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        @media (min-width: 720px) {
          .chat-album-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .chat-album-media-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>

      <div style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: theme.textHeading }}>Photo & video albums</div>
          <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.45 }}>
            Create nested folders like Family → Ooty trip. Upload memories and share album links with your thread.
          </div>
        </div>

        <div className="chat-album-breadcrumb">
          <button type="button" onClick={() => setAlbumPath([])}>All albums</button>
          {albumPath.map((folder, index) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setAlbumPath(albumPath.slice(0, index + 1))}
            >
              {folder.name}
            </button>
          ))}
        </div>

        {canManage ? (
          <form
            onSubmit={(event) => onCreateFolder(event, currentParentId)}
            style={{ display: 'grid', gap: '8px', padding: '12px', borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg }}
          >
            <div style={{ fontSize: '12px', fontWeight: 800, color: theme.textHeading }}>
              {currentFolder ? `New sub-album inside "${currentFolder.name}"` : 'New album folder'}
            </div>
            <input
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary, fontSize: '14px' }}
              value={folderForm.name}
              onChange={(e) => onFolderFormChange({ ...folderForm, name: e.target.value })}
              placeholder={currentFolder ? 'e.g. Day 2 hike' : 'e.g. Family, Ooty trip'}
            />
            <input
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary, fontSize: '13px' }}
              value={folderForm.description}
              onChange={(e) => onFolderFormChange({ ...folderForm, description: e.target.value })}
              placeholder="Optional caption"
            />
            <button type="submit" style={{ border: 'none', borderRadius: '12px', padding: '11px 14px', background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
              Create album folder
            </button>
          </form>
        ) : null}

        {currentFolders.length ? (
          <div className="chat-album-grid">
            {currentFolders.map((folder) => {
              const cover = folderCoverMap[folder.id];
              const childCount = (folderTree.get(folder.id) || []).length;
              const mediaCount = (folder.items || []).filter((item) => item.imageId).length;
              return (
                <button
                  key={folder.id}
                  type="button"
                  className="chat-album-card"
                  onClick={() => setAlbumPath([...albumPath, folder])}
                >
                  <div className="chat-album-cover" style={{ background: albumGradient(folder.name) }}>
                    {cover?.imageUrl ? <img src={cover.imageUrl} alt="" /> : null}
                    <div className="chat-album-cover-content">
                      <div style={{ fontSize: '24px' }}>{albumEmoji(folder.name)}</div>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>{folder.name}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.82)' }}>
                        {mediaCount} media · {childCount} subfolder{childCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '18px', borderRadius: '14px', border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, fontSize: '13px', textAlign: 'center', lineHeight: 1.5 }}>
            {currentFolder ? 'No sub-albums here yet. Create one or upload photos below.' : 'No albums yet. Create your first folder — Family, Ooty, Wedding…'}
          </div>
        )}

        {currentFolder ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: theme.textHeading }}>{currentFolder.name} · {folderImages.length} items</div>
              {onShareFolder ? (
                <button type="button" onClick={() => onShareFolder(currentFolder)} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: '999px', padding: '7px 12px', background: theme.panelBg, color: theme.textPrimary, fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                  Share album
                </button>
              ) : null}
            </div>

            {canManage ? (
              <div style={{ display: 'grid', gap: '8px', padding: '12px', borderRadius: '14px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                <input
                  style={{ width: '100%', boxSizing: 'border-box', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary }}
                  value={imageCaption}
                  onChange={(e) => onImageCaptionChange(e.target.value)}
                  placeholder="Caption for upload"
                />
                <button type="button" onClick={() => { onSelectUploadFolder(currentFolder.id); onPickFiles(); }} style={{ border: 'none', borderRadius: '12px', padding: '12px', background: theme.orange, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                  📷 Upload photos & videos
                </button>
              </div>
            ) : null}

            {folderImages.length ? (
              <>
                <div className="chat-album-filmstrip">
                  {folderImages.map((image, imageIndex) => (
                    <button key={`strip-${image.id}`} type="button" className="chat-album-media-tile" onClick={() => setLightboxIndex(imageIndex)} style={{ flex: '0 0 120px' }}>
                      {isVideoMedia(image) ? (
                        <video src={image.imageUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img src={image.imageUrl} alt={image.caption || 'Album media'} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="chat-album-media-grid">
                  {folderImages.map((image, imageIndex) => (
                    <button key={image.id} type="button" className="chat-album-media-tile" onClick={() => setLightboxIndex(imageIndex)}>
                      {isVideoMedia(image) ? (
                        <>
                          <video src={image.imageUrl} muted playsInline preload="metadata" />
                          <span className="chat-album-media-badge">▶ Video</span>
                        </>
                      ) : (
                        <img src={image.imageUrl} alt={image.caption || 'Album media'} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '12px', color: theme.textMuted, padding: '8px 2px' }}>No photos or videos in this album yet.</div>
            )}
          </div>
        ) : null}

        {!currentFolder && canManage ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted }}>Quick upload (pick album first)</div>
            <select
              style={{ width: '100%', borderRadius: '10px', border: `1px solid ${theme.cardBorder}`, padding: '10px 12px', background: theme.inputBg, color: theme.textPrimary }}
              value={selectedUploadFolderId}
              onChange={(e) => onSelectUploadFolder(e.target.value)}
            >
              <option value="">Select album folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <button type="button" onClick={onPickFiles} style={{ border: 'none', borderRadius: '12px', padding: '12px', background: theme.blue, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
              Upload to selected album
            </button>
          </div>
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
