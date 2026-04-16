import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { restoreUserSession } from '../lib/auth-client';

const ZIP_FILES_PER_PART = 100;
const ZIP_BUILD_BATCH_SIZE = 50;
const MAX_ZIP_PART_BYTES = 180 * 1024 * 1024;

const bytesToMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Less than a minute';
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

const estimateZipSize = (files) => {
  if (!files.length) {
    return null;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const highlyCompressedExt = [
    'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'mp3', 'aac', 'pdf', 'zip', 'rar', '7z',
  ];
  const compressibleExt = ['json', 'txt', 'csv', 'xml', 'log'];

  let highlyCompressedBytes = 0;
  let compressibleBytes = 0;

  files.forEach((file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (highlyCompressedExt.includes(ext)) {
      highlyCompressedBytes += file.size;
      return;
    }
    if (compressibleExt.includes(ext)) {
      compressibleBytes += file.size;
    }
  });

  const otherBytes = totalBytes - highlyCompressedBytes - compressibleBytes;
  const estimatedBytes = Math.round(
    (highlyCompressedBytes * 0.98) +
    (compressibleBytes * 0.55) +
    (otherBytes * 0.88) +
    (files.length * 180)
  );

  const lowerBound = Math.max(0, Math.round(estimatedBytes * 0.96));
  const upperBound = Math.round(estimatedBytes * 1.04);

  return {
    originalMB: bytesToMB(totalBytes),
    estimatedMB: bytesToMB(estimatedBytes),
    rangeMB: `${bytesToMB(lowerBound)} - ${bytesToMB(upperBound)}`,
    mostlyAlreadyCompressed: highlyCompressedBytes / totalBytes > 0.75,
  };
};

const estimateUploadSeconds = (sizeMB, speedMbps) => {
  const numericSizeMB = Number(sizeMB);
  const numericSpeedMbps = Number(speedMbps);

  if (!Number.isFinite(numericSizeMB) || !Number.isFinite(numericSpeedMbps) || numericSpeedMbps <= 0) {
    return null;
  }

  return (numericSizeMB * 8) / numericSpeedMbps;
};

const isVideoFile = (file) => {
  if (file.type?.startsWith('video/')) {
    return true;
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v'].includes(ext);
};

const getFileYear = (file) => {
  const timestamp = file.lastModified || file.lastModifiedDate?.getTime?.();
  if (!timestamp) {
    return 'Unknown';
  }

  const year = new Date(timestamp).getFullYear();
  return Number.isFinite(year) && year > 1970 ? String(year) : 'Unknown';
};

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

const splitIntoChunks = (files, chunkSize) => {
  const chunks = [];
  let currentChunk = [];
  let currentBytes = 0;

  files.forEach((file) => {
    const nextBytes = currentBytes + file.size;
    const shouldStartNewChunk = currentChunk.length > 0 && (
      currentChunk.length >= chunkSize || nextBytes > MAX_ZIP_PART_BYTES
    );

    if (shouldStartNewChunk) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }

    currentChunk.push(file);
    currentBytes += file.size;
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const uploadZipPart = (formData, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload-zip');

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) {
      return;
    }
    onProgress(event.loaded / event.total);
  };

  xhr.onload = () => {
    try {
      const payload = JSON.parse(xhr.responseText || '{}');
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }
      reject(new Error(payload.error || `Upload failed with status ${xhr.status}`));
    } catch (error) {
      reject(new Error('Upload completed but response parsing failed'));
    }
  };

  xhr.onerror = () => reject(new Error('Network error during ZIP upload'));
  xhr.send(formData);
});

const createInitialPartStatuses = (chunks) => chunks.map((chunkFiles, index) => ({
  partNumber: index + 1,
  year: chunkFiles.year,
  yearPartNumber: chunkFiles.yearPartNumber,
  yearPartTotal: chunkFiles.yearPartTotal,
  fileCount: chunkFiles.files.length,
  status: 'waiting',
  detail: 'Waiting to start',
}));

const buildYearGroups = (files) => {
  const groups = new Map();

  files.forEach((file) => {
    const year = getFileYear(file);
    if (!groups.has(year)) {
      groups.set(year, { year, files: [], totalBytes: 0 });
    }

    const group = groups.get(year);
    group.files.push(file);
    group.totalBytes += file.size;
  });

  return Array.from(groups.values()).sort((left, right) => right.year.localeCompare(left.year, undefined, { numeric: true }));
};

const buildYearSelectionMap = (groups) => groups.reduce((accumulator, group) => ({
  ...accumulator,
  [group.year]: true,
}), {});

const buildYearChunks = (groups, selectedYears, chunkSize) => {
  const chunks = [];

  groups.forEach((group) => {
    if (!selectedYears[group.year]) {
      return;
    }

    const yearChunks = splitIntoChunks(group.files, chunkSize);
    yearChunks.forEach((files, index) => {
      chunks.push({
        year: group.year,
        files,
        yearPartNumber: index + 1,
        yearPartTotal: yearChunks.length,
      });
    });
  });

  return chunks;
};

export default function Media() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedYears, setSelectedYears] = useState({});
  const [selectionSource, setSelectionSource] = useState('files');
  const [skippedVideoCount, setSkippedVideoCount] = useState(0);
  const [uploadSpeedMbps, setUploadSpeedMbps] = useState('10');
  const [speedSource, setSpeedSource] = useState('manual');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [partStatuses, setPartStatuses] = useState([]);
  const [zipUrl, setZipUrl] = useState(null);
  const [zipSize, setZipSize] = useState(0);
  const [zips, setZips] = useState([]);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.connection?.downlink) {
      return;
    }

    const detectedDownlink = String(navigator.connection.downlink);
    setUploadSpeedMbps(detectedDownlink);
    setSpeedSource('detected');
  }, []);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const mergedFiles = [...selectedFiles, ...files];
    const groups = buildYearGroups(mergedFiles);
    setSelectionSource('files');
    setSkippedVideoCount(0);
    setUploadStatus('');
    setPartStatuses([]);
    setSelectedYears(buildYearSelectionMap(groups));
    setSelectedFiles(mergedFiles);
  };

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((file) => !isVideoFile(file));
    const groups = buildYearGroups(imageFiles);
    setSelectionSource('folder');
    setSkippedVideoCount(files.length - imageFiles.length);
    setUploadStatus('');
    setPartStatuses([]);
    setSelectedYears(buildYearSelectionMap(groups));
    setSelectedFiles(imageFiles);
  };

  const updatePartStatus = (partNumber, status, detail) => {
    setPartStatuses((current) => current.map((part) => (
      part.partNumber === partNumber ? { ...part, status, detail } : part
    )));
  };

  const removeFile = (idx) => {
    setSelectedFiles((prev) => {
      const nextFiles = prev.filter((_, i) => i !== idx);
      const groups = buildYearGroups(nextFiles);
      setSelectedYears((current) => groups.reduce((accumulator, group) => ({
        ...accumulator,
        [group.year]: current[group.year] ?? true,
      }), {}));
      return nextFiles;
    });
  };

  const createZipChunk = async (chunkFiles, chunkIndex, totalChunks) => {
    if (chunkFiles.length === 0) {
      alert('Select files first');
      return;
    }

    try {
      const zip = new JSZip();

      for (let index = 0; index < chunkFiles.length; index += ZIP_BUILD_BATCH_SIZE) {
        const batch = chunkFiles.slice(index, index + ZIP_BUILD_BATCH_SIZE);
        batch.forEach((file) => {
          zip.file(file.webkitRelativePath || file.name, file, {
            compression: 'STORE',
          });
        });

        const phaseProgress = ((index + batch.length) / chunkFiles.length) * 0.35;
        setUploadProgress(Math.round((((chunkIndex - 1) + phaseProgress) / totalChunks) * 100));
        setUploadStatus(`Preparing ZIP ${chunkIndex}/${totalChunks}: added ${index + batch.length} of ${chunkFiles.length} files`);
        updatePartStatus(chunkIndex, 'preparing', `Added ${index + batch.length}/${chunkFiles.length} files`);
        await yieldToBrowser();
      }

      const blob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'STORE',
          streamFiles: true,
        },
        (metadata) => {
          const phaseProgress = 0.35 + ((metadata.percent / 100) * 0.35);
          setUploadProgress(Math.round((((chunkIndex - 1) + phaseProgress) / totalChunks) * 100));
          setUploadStatus(`Compressing ZIP ${chunkIndex}/${totalChunks}: ${Math.round(metadata.percent)}%`);
          updatePartStatus(chunkIndex, 'compressing', `${Math.round(metadata.percent)}% compressed`);
        }
      );

      updatePartStatus(chunkIndex, 'ready', `ZIP ready (${bytesToMB(blob.size)} MB)`);

      return blob;
    } catch (err) {
      console.error('ZIP create error:', err);
      alert('Failed to create ZIP');
      setUploading(false);
      setUploadStatus('ZIP creation failed');
    }
  };

  const uploadZipToS3 = async () => {
    if (!user) {
      alert('User not found');
      return;
    }

    if (activeFiles.length === 0) {
      alert('Select at least one year before uploading');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setZipUrl(null);

      const timestamp = Date.now();
      const chunks = buildYearChunks(yearGroups, selectedYears, ZIP_FILES_PER_PART);
      let totalZipBytes = 0;

      setPartStatuses(createInitialPartStatuses(chunks));

      setUploadStatus(`Preparing ${chunks.length} ZIP part${chunks.length > 1 ? 's' : ''} in the browser`);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkNumber = chunkIndex + 1;
        const chunkPlan = chunks[chunkIndex];
        const chunkFiles = chunkPlan.files;
        updatePartStatus(chunkNumber, 'preparing', `Starting ${chunkPlan.year} part ${chunkPlan.yearPartNumber}/${chunkPlan.yearPartTotal} for ${chunkFiles.length} files`);
        const zipBlob = await createZipChunk(chunkFiles, chunkNumber, chunks.length);

        if (!zipBlob) {
          return;
        }

        totalZipBytes += zipBlob.size;
        setUploadStatus(`Uploading ZIP ${chunkNumber}/${chunks.length} to S3`);
        updatePartStatus(chunkNumber, 'uploading', `Uploading ${bytesToMB(zipBlob.size)} MB to S3`);

        const formData = new FormData();
        formData.append('file', zipBlob, `media_${user.username}_${chunkPlan.year}_${timestamp}_part-${String(chunkPlan.yearPartNumber).padStart(2, '0')}-of-${String(chunkPlan.yearPartTotal).padStart(2, '0')}.zip`);
        formData.append('username', user.username);

        await uploadZipPart(formData, (uploadFraction) => {
          const phaseProgress = 0.7 + (uploadFraction * 0.3);
          setUploadProgress(Math.round((((chunkNumber - 1) + phaseProgress) / chunks.length) * 100));
          updatePartStatus(chunkNumber, 'uploading', `${Math.round(uploadFraction * 100)}% uploaded`);
        });

        setUploadStatus(`Finished ZIP ${chunkNumber}/${chunks.length}`);
        updatePartStatus(chunkNumber, 'uploaded', 'Uploaded successfully');
        await yieldToBrowser();
      }

      setZipSize(bytesToMB(totalZipBytes));
      setUploadProgress(100);
      setUploadStatus(`Uploaded ${chunks.length} ZIP part${chunks.length > 1 ? 's' : ''} successfully`);

      alert(`✅ Uploaded ${selectedFiles.length} files as ${chunks.length} ZIP part${chunks.length > 1 ? 's' : ''} (${bytesToMB(totalZipBytes)} MB total)`);

      // Reset
      setSelectedFiles([]);
      setSkippedVideoCount(0);
      setUploadProgress(0);
      setUploading(false);
      setZipUrl(null);

      // Optionally fetch updated list
      fetchZips();
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + err.message);
      setUploading(false);
      setUploadStatus(`Upload failed: ${err.message}`);
      setPartStatuses((current) => current.map((part) => (
        part.status === 'uploaded' || part.status === 'waiting'
          ? part
          : { ...part, status: 'failed', detail: err.message }
      )));
    }
  };

  const downloadZipLocal = () => {
    if (zipUrl) {
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `media_${Date.now()}.zip`;
      link.click();
    }
  };

  const fetchZips = async () => {
    try {
      const res = await fetch('/api/list-zips');
      const data = await res.json();
      setZips(data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchZips();
  }, []);

  const deleteZip = async (zipKey) => {
    if (!confirm('Delete this ZIP?')) return;

    try {
      const res = await fetch('/api/delete-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: zipKey }),
      });

      if (res.ok) {
        alert('Deleted');
        fetchZips();
      } else {
        alert('Delete failed');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const downloadZipFromS3 = async (zipUrl, zipName) => {
    try {
      const response = await fetch(zipUrl);
      const blob = await response.blob();
      saveAs(blob, zipName);
    } catch (err) {
      console.error('Download error:', err);
      alert('Download failed');
    }
  };

  const yearGroups = buildYearGroups(selectedFiles);
  const activeFiles = selectedFiles.filter((file) => selectedYears[getFileYear(file)]);
  const activeYearGroups = yearGroups.filter((group) => selectedYears[group.year]);
  const zipEstimate = estimateZipSize(activeFiles);
  const chunkCount = activeFiles.length ? buildYearChunks(yearGroups, selectedYears, ZIP_FILES_PER_PART).length : 0;
  const estimatedUploadSeconds = zipEstimate
    ? estimateUploadSeconds(zipEstimate.estimatedMB, uploadSpeedMbps)
    : null;

  if (!user) return <div style={{ padding: '20px' }}>Loading...</div>;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body, html { margin: 0; padding: 0; width: 100%; overflow-x: hidden; }
        @media (max-width: 768px) {
          body { font-size: 14px; }
          h1 { font-size: 16px !important; }
          h2 { font-size: 14px !important; }
          button { padding: 8px 10px !important; font-size: 12px !important; }
        }
      `}</style>
      <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={{ margin: '0', fontSize: '18px' }}>📸 Media</h1>
        <button onClick={() => router.push('/dashboard')} style={styles.back}>
          ← Back
        </button>
      </div>

      {/* UPLOAD SECTION */}
      <div style={styles.card}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>📤 Upload</h2>
        <p style={styles.info}>
          For very large galleries, select the whole folder and upload it as one ZIP instead of sending thousands of files individually.
        </p>

        <div style={styles.fileInputWrapper}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            directory=""
            webkitdirectory=""
            mozdirectory=""
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
          />
          <button onClick={() => fileInputRef.current?.click()} style={styles.btn}>
            📁 Select Files
          </button>
          <button onClick={() => folderInputRef.current?.click()} style={styles.secondaryBtn}>
            🗂 Select Folder
          </button>
        </div>

        {selectedFiles.length > 0 && (
          <div style={styles.selectedSection}>
            <p>
              <strong>📊 {selectedFiles.length} files selected</strong> (~{bytesToMB(selectedFiles.reduce((s, f) => s + f.size, 0))} MB)
            </p>
            <p style={styles.selectionHint}>
              Source: {selectionSource === 'folder' ? 'folder ZIP upload' : 'manual file selection'}
            </p>
            <p style={styles.selectionHint}>
              ZIP plan: {chunkCount || 0} part{chunkCount === 1 ? '' : 's'} of up to {ZIP_FILES_PER_PART} files or about {bytesToMB(MAX_ZIP_PART_BYTES)} MB each.
            </p>
            {yearGroups.length > 0 && (
              <div style={styles.yearsBox}>
                <div style={styles.yearsHeader}>
                  <p style={styles.partsTitle}>Select years before upload</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedYears(buildYearSelectionMap(yearGroups));
                      setUploadStatus('');
                      setPartStatuses([]);
                    }}
                    style={styles.yearActionBtn}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedYears(yearGroups.reduce((accumulator, group) => ({ ...accumulator, [group.year]: false }), {}));
                      setUploadStatus('');
                      setPartStatuses([]);
                    }}
                    style={styles.yearActionBtn}
                  >
                    Unselect all
                  </button>
                </div>
                <div style={styles.yearsList}>
                  {yearGroups.map((group) => (
                    <label key={group.year} style={styles.yearRow}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedYears[group.year])}
                        onChange={(e) => {
                          setSelectedYears((current) => ({ ...current, [group.year]: e.target.checked }));
                          setUploadStatus('');
                          setPartStatuses([]);
                        }}
                      />
                      <div style={styles.yearInfo}>
                        <p style={styles.partName}>{group.year}</p>
                        <p style={styles.partMeta}>{group.files.length} files • {bytesToMB(group.totalBytes)} MB</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p style={styles.yearSummary}>
                  Selected: {activeYearGroups.length} year group{activeYearGroups.length === 1 ? '' : 's'} • {activeFiles.length} files • {bytesToMB(activeFiles.reduce((sum, file) => sum + file.size, 0))} MB
                </p>
              </div>
            )}
            {selectionSource === 'folder' && skippedVideoCount > 0 && (
              <p style={styles.warningText}>
                Skipped {skippedVideoCount} video file{skippedVideoCount > 1 ? 's' : ''} from the selected folder.
              </p>
            )}
            {zipEstimate && (
              <div style={styles.estimateBox}>
                <p style={styles.estimateLine}><strong>Estimated ZIP size:</strong> ~{zipEstimate.estimatedMB} MB</p>
                <p style={styles.estimateLine}><strong>Expected range:</strong> {zipEstimate.rangeMB} MB</p>
                <p style={styles.estimateLine}><strong>Original total:</strong> {zipEstimate.originalMB} MB</p>
                <div style={styles.speedRow}>
                  <label htmlFor="upload-speed" style={styles.speedLabel}>Estimated upload speed (Mbps)</label>
                  <input
                    id="upload-speed"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={uploadSpeedMbps}
                    onChange={(e) => {
                      setUploadSpeedMbps(e.target.value);
                      setSpeedSource('manual');
                    }}
                    style={styles.speedInput}
                  />
                </div>
                <p style={styles.estimateLine}>
                  <strong>Estimated upload time:</strong> {estimatedUploadSeconds ? formatDuration(estimatedUploadSeconds) : 'Enter a valid speed'}
                </p>
                <p style={styles.estimateHint}>
                  Using {speedSource === 'detected' ? 'detected browser network speed' : 'manual network speed'}. This is an estimate, not an exact transfer guarantee.
                </p>
                <p style={styles.estimateHint}>
                  ZIP is lossless. After unzip, you get the same image and video quality as the originals.
                  {zipEstimate.mostlyAlreadyCompressed ? ' Camera photos and videos are usually already compressed, so ZIP size may stay close to the original.' : ''}
                </p>
                <p style={styles.estimateHint}>
                  Large folders are added to the ZIP in batches without recompressing each image, which keeps the browser more responsive.
                </p>
                <p style={styles.estimateHint}>
                  While uploading, you will see which ZIP part is being prepared or uploaded in the background.
                </p>
              </div>
            )}

            {uploadStatus && (
              <div style={styles.statusBox}>
                <p style={styles.statusText}><strong>Background status:</strong> {uploadStatus}</p>
                <p style={styles.statusMeta}>Overall progress: {uploadProgress}%</p>
              </div>
            )}

            {partStatuses.length > 0 && (
              <div style={styles.partsBox}>
                <p style={styles.partsTitle}>Per-part progress</p>
                <div style={styles.partsList}>
                  {partStatuses.map((part) => (
                    <div key={part.partNumber} style={styles.partRow}>
                      <div>
                        <p style={styles.partName}>Part {part.partNumber} • {part.year}</p>
                        <p style={styles.partMeta}>{part.fileCount} files • year part {part.yearPartNumber}/{part.yearPartTotal}</p>
                      </div>
                      <div style={styles.partStatusBlock}>
                        <span style={{ ...styles.partBadge, ...(styles.partBadgeStates[part.status] || styles.partBadgeStates.waiting) }}>
                          {part.status}
                        </span>
                        <p style={styles.partDetail}>{part.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.fileList}>
              {selectedFiles.slice(0, 5).map((f, i) => (
                <div key={i} style={styles.fileItem}>
                  <span>{f.webkitRelativePath || f.name}</span>
                  <button onClick={() => removeFile(i)} style={styles.removeBtn}>✕</button>
                </div>
              ))}
              {selectedFiles.length > 5 && <p style={{ fontSize: '12px', color: '#999' }}>+{selectedFiles.length - 5} more...</p>}
            </div>

            <div style={styles.actions}>
              <button onClick={uploadZipToS3} disabled={uploading} style={styles.uploadBtn}>
                {uploading ? `Working... ${uploadProgress}%` : `🚀 Upload to S3 as ${chunkCount || 1} ZIP part${chunkCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {uploading && (
          <div style={styles.progressBar}>
            <div style={{ ...styles.progress, width: `${uploadProgress}%` }}></div>
          </div>
        )}
      </div>

      {/* GALLERY SECTION */}
      <div style={styles.card}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>📦 Your ZIPs</h2>

        {zips.length === 0 ? (
          <p style={styles.info}>No ZIPs yet. Upload files above.</p>
        ) : (
          <div style={styles.zipList}>
            {zips.map((zip, i) => (
              <div key={i} style={styles.zipItem}>
                <div style={styles.zipInfo}>
                  <p><strong>{zip.name}</strong></p>
                  <p style={styles.meta}>📅 {new Date(zip.uploadedAt).toLocaleDateString()}</p>
                  <p style={styles.meta}>📦 {(zip.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <div style={styles.zipActions}>
                  <button onClick={() => downloadZipFromS3(zip.url, zip.name)} style={styles.downloadBtn}>
                    ⬇️ Download
                  </button>
                  <button onClick={() => deleteZip(zip.key)} style={styles.deleteBtn}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  );
}

const styles = {
  container: {
    background: '#0f0f0f',
    color: '#00ff9f',
    minHeight: '100vh',
    width: '100%',
    padding: '8px',
    fontFamily: "'Fira Code', monospace",
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    flexWrap: 'wrap',
    gap: '8px',
    width: '100%',
  },

  back: {
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    minWidth: 'fit-content',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  card: {
    background: 'rgba(0, 255, 159, 0.05)',
    border: '1px solid #00ff9f33',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '12px',
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },

  info: {
    fontSize: '11px',
    color: '#00ff9f99',
    marginBottom: '12px',
    lineHeight: '1.3',
    overflowWrap: 'break-word',
  },

  warningText: {
    margin: '6px 0 10px 0',
    color: '#fbbf24',
    fontSize: '12px',
  },

  fileInputWrapper: {
    marginBottom: '10px',
    width: '100%',
  },

  btn: {
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    padding: '10px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    width: '100%',
    boxSizing: 'border-box',
  },

  selectedSection: {
    background: 'rgba(0, 255, 159, 0.02)',
    border: '1px solid #00ff9f22',
    borderRadius: '8px',
    padding: '10px',
    marginTop: '10px',
    width: '100%',
    boxSizing: 'border-box',
  },

  statusBox: {
    background: 'rgba(2, 6, 23, 0.75)',
    border: '1px solid #38bdf822',
    borderRadius: '8px',
    padding: '10px',
    marginBottom: '10px',
  },

  statusText: {
    margin: 0,
    color: '#e0f2fe',
    fontSize: '12px',
  },

  statusMeta: {
    margin: '6px 0 0 0',
    color: '#7dd3fc',
    fontSize: '11px',
  },

  yearsBox: {
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px',
    marginBottom: '10px',
  },

  yearsHeader: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },

  yearActionBtn: {
    background: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '11px',
  },

  yearsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '220px',
    overflowY: 'auto',
  },

  yearRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    borderRadius: '6px',
    background: 'rgba(2, 6, 23, 0.65)',
    border: '1px solid #1e293b',
  },

  yearInfo: {
    display: 'flex',
    flexDirection: 'column',
  },

  yearSummary: {
    margin: '10px 0 0 0',
    color: '#cbd5e1',
    fontSize: '11px',
  },

  partsBox: {
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px',
    marginBottom: '10px',
  },

  partsTitle: {
    margin: '0 0 8px 0',
    color: '#e2e8f0',
    fontSize: '12px',
    fontWeight: '700',
  },

  partsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '220px',
    overflowY: 'auto',
  },

  partRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px',
    borderRadius: '6px',
    background: 'rgba(2, 6, 23, 0.65)',
    border: '1px solid #1e293b',
  },

  partName: {
    margin: 0,
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: '600',
  },

  partMeta: {
    margin: '4px 0 0 0',
    color: '#94a3b8',
    fontSize: '11px',
  },

  partStatusBlock: {
    minWidth: '140px',
    textAlign: 'right',
  },

  partBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  partDetail: {
    margin: '6px 0 0 0',
    color: '#cbd5e1',
    fontSize: '11px',
  },

  partBadgeStates: {
    waiting: {
      background: '#334155',
      color: '#e2e8f0',
    },
    preparing: {
      background: '#1d4ed8',
      color: '#dbeafe',
    },
    compressing: {
      background: '#7c3aed',
      color: '#ede9fe',
    },
    ready: {
      background: '#0f766e',
      color: '#ccfbf1',
    },
    uploading: {
      background: '#b45309',
      color: '#fef3c7',
    },
    uploaded: {
      background: '#166534',
      color: '#dcfce7',
    },
    failed: {
      background: '#991b1b',
      color: '#fee2e2',
    },
  },

  estimateBox: {
    background: 'rgba(15, 23, 42, 0.65)',
    border: '1px solid #00ff9f22',
    borderRadius: '8px',
    padding: '10px',
    marginBottom: '10px',
  },

  estimateLine: {
    margin: '0 0 4px 0',
    fontSize: '12px',
    color: '#d1fae5',
  },

  speedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '8px 0',
    flexWrap: 'wrap',
  },

  speedLabel: {
    fontSize: '12px',
    color: '#d1fae5',
  },

  speedInput: {
    background: '#020617',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '6px 8px',
    width: '120px',
  },

  estimateHint: {
    margin: '8px 0 0 0',
    fontSize: '11px',
    lineHeight: '1.4',
    color: '#94a3b8',
  },

  fileList: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '6px',
    padding: '6px',
    marginBottom: '10px',
    maxHeight: '100px',
    overflowY: 'auto',
    width: '100%',
    boxSizing: 'border-box',
  },

  fileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '5px',
    borderBottom: '1px solid #00ff9f11',
    fontSize: '10px',
    wordBreak: 'break-word',
    gap: '5px',
  },

  removeBtn: {
    background: '#ff4d4d',
    border: 'none',
    color: 'white',
    padding: '2px 5px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '10px',
    flexShrink: 0,
    marginLeft: '3px',
  },

  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },

  uploadBtn: {
    background: '#00ff9f',
    color: '#000',
    border: 'none',
    padding: '10px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    width: '100%',
    fontSize: '12px',
    boxSizing: 'border-box',
  },

  downloadBtn: {
    background: '#1f6feb',
    color: 'white',
    border: 'none',
    padding: '8px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    width: '100%',
    fontSize: '12px',
    boxSizing: 'border-box',
  },

  deleteBtn: {
    background: '#da3633',
    color: 'white',
    border: 'none',
    padding: '8px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11px',
  },

  progressBar: {
    background: '#00ff9f22',
    borderRadius: '4px',
    overflow: 'hidden',
    height: '6px',
    marginTop: '8px',
    width: '100%',
  },

  progress: {
    background: '#00ff9f',
    height: '100%',
    transition: 'width 0.3s',
  },

  zipList: {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: '1fr',
    width: '100%',
  },

  zipItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid #00ff9f22',
    borderRadius: '8px',
    padding: '10px',
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },

  zipInfo: {
    flex: 1,
    width: '100%',
    overflowX: 'hidden',
  },

  meta: {
    fontSize: '10px',
    color: '#00ff9f77',
    margin: '2px 0',
    overflowWrap: 'break-word',
  },

  zipActions: {
    display: 'flex',
    gap: '8px',
    flexDirection: 'column',
    width: '100%',
  },
};
