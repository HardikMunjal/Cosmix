import { useState } from 'react';
import { useRouter } from 'next/router';

export default function UploadZip() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleUpload = async () => {
    if (!files.length) return;

    setLoading(true);
    setStatus('Creating ZIP...');

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      files.forEach(file => {
        zip.file(file.name, file);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const user = JSON.parse(localStorage.getItem('user'));
      const today = new Date();

      const folder = `${today
        .getDate()
        .toString()
        .padStart(2, '0')}${(today.getMonth() + 1)
        .toString()
        .padStart(2, '0')}${today.getFullYear()}/${user.username}`;

      setStatus('Uploading ZIP...');

      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: `archive-${Date.now()}.zip`,
          fileType: 'application/zip',
          folder,
        }),
      });

      const { uploadURL } = await res.json();

      await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: zipBlob,
      });

      setStatus('✅ ZIP uploaded successfully!');
    } catch (err) {
      console.error(err);
      setStatus('❌ Upload failed');
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h1>📦 ZIP Upload</h1>

      <input
        type="file"
        multiple
        onChange={(e) => setFiles([...e.target.files])}
      />

      <br /><br />

      <button onClick={handleUpload} style={styles.button}>
        {loading ? 'Processing...' : 'Upload ZIP'}
      </button>

      <button
        onClick={() => router.push('/gallery-zip')}
        style={styles.secondaryBtn}
      >
        📂 Go to ZIP Gallery
      </button>

      <p>{status}</p>
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
  button: {
    background: '#8957e5',
    color: 'white',
    padding: '10px',
    border: 'none',
    borderRadius: '6px',
    marginRight: '10px',
  },
  secondaryBtn: {
    background: '#1f6feb',
    color: 'white',
    padding: '10px',
    border: 'none',
    borderRadius: '6px',
  },
};