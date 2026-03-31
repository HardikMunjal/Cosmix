import { useState, useRef } from 'react';
import { useRouter } from 'next/router';

export default function Upload() {
  const router = useRouter();
  const fileInputRef = useRef();

  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);

  const handleFiles = (selectedFiles) => {
    setFiles([...selectedFiles]);
  };

  const handleUpload = async () => {
    if (!files.length) return;

    setLoading(true);
    setProgress(0);

    const startTime = Date.now();

    const user = JSON.parse(localStorage.getItem('user'));
    const today = new Date();

    const folder = `${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1)
      .toString()
      .padStart(2, '0')}${today.getFullYear()}/${user.username}`;

    let uploaded = 0;
    let uploadedBytes = 0;

    const uploadSingle = async (file) => {
      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          folder,
        }),
      });

      const { uploadURL } = await res.json();

      await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      uploaded++;
      uploadedBytes += file.size;

      const elapsed = (Date.now() - startTime) / 1000;
      const mbps = (uploadedBytes / (1024 * 1024)) / elapsed;

      setSpeed(mbps.toFixed(2));
      setProgress(Math.round((uploaded / files.length) * 100));
    };

    const chunkSize = 5;
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      await Promise.all(chunk.map(uploadSingle));
    }

    setStatus('✅ Upload complete');
    setLoading(false);
  };

  const totalSizeMB = (
    files.reduce((acc, f) => acc + f.size, 0) /
    (1024 * 1024)
  ).toFixed(2);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🚀 Upload Console</h1>

      {/* Drag Drop */}
      <div
        style={styles.dropZone}
        onClick={() => fileInputRef.current.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        Drag & Drop files here or click
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {files.length > 0 && (
        <>
          <p>📂 {files.length} files</p>
          <p>📦 {totalSizeMB} MB</p>
        </>
      )}

      {/* Preview */}
      <div style={styles.preview}>
        {files.slice(0, 5).map((file, i) => (
          <img
            key={i}
            src={URL.createObjectURL(file)}
            style={styles.thumb}
          />
        ))}
      </div>

      <button onClick={handleUpload} style={styles.button}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>

      {/* Progress */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
      </div>

      <p>{progress}% | ⚡ {speed} MB/s</p>

      {progress === 100 && (
        <button onClick={() => router.push('/gallery')} style={styles.galleryBtn}>
          View Gallery →
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: '#0d1117',
    color: '#c9d1d9',
    minHeight: '100vh',
    padding: '40px',
    fontFamily: 'monospace',
  },
  title: { color: '#58a6ff' },
  dropZone: {
    border: '2px dashed #30363d',
    padding: '40px',
    textAlign: 'center',
    marginBottom: '20px',
    cursor: 'pointer',
  },
  preview: { display: 'flex', gap: '10px', margin: '10px 0' },
  thumb: { width: '80px', height: '80px', objectFit: 'cover' },
  button: {
    background: '#238636',
    padding: '10px 20px',
    border: 'none',
    color: 'white',
    borderRadius: '6px',
  },
  progressBar: {
    width: '100%',
    height: '10px',
    background: '#21262d',
    marginTop: '10px',
  },
  progressFill: {
    height: '100%',
    background: '#58a6ff',
  },
  galleryBtn: {
    marginTop: '10px',
    background: '#8957e5',
    padding: '10px',
    border: 'none',
    color: 'white',
  },
};