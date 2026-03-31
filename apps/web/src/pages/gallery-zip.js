import { useEffect, useState } from 'react';

export default function GalleryZip() {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    fetch('/api/list-files')
      .then(res => res.json())
      .then(data => {
        const zipFiles = (data.files || []).filter(f => f.endsWith('.zip'));
        setFiles(zipFiles);
      });
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📦 ZIP Gallery</h1>

      {files.length === 0 ? (
        <p>No ZIP files found</p>
      ) : (
        <div style={styles.list}>
          {files.map((url, i) => {
            const name = url.split('/').pop();

            return (
              <div key={i} style={styles.row}>
                <span>{name}</span>

                <button
                  style={styles.downloadBtn}
                  onClick={() => window.open(url)}
                >
                  ⬇ Download
                </button>
              </div>
            );
          })}
        </div>
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
  title: {
    color: '#58a6ff',
  },
  list: {
    marginTop: '20px',
  },
  row: {
    background: '#161b22',
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
  },
  downloadBtn: {
    background: '#1f6feb',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};