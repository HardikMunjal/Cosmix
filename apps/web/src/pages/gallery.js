import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function Gallery() {
    const [folders, setFolders] = useState({});

    const fetchFiles = async () => {
        const res = await fetch('/api/list-files');
        const data = await res.json();

        const grouped = {};

        data.forEach(file => {
            const parts = file.key.split('/');
            const date = parts[0];
            const user = parts[1];

            if (!grouped[date]) grouped[date] = {};

            if (!grouped[date][user]) {
                grouped[date][user] = {
                    files: [],
                    totalSize: 0,
                };
            }

            grouped[date][user].files.push(file.url);
            grouped[date][user].totalSize += file.size;
        });

        setFolders(grouped);
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const deleteFolder = async (folderPath) => {
        await fetch('/api/delete-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: folderPath }),
        });

        fetchFiles(); // refresh
    };

    const downloadFolder = async (files, folderName) => {
  try {
    const zip = new JSZip();

    for (let i = 0; i < files.length; i++) {
      const fileUrl = files[i];

      try {
        const response = await fetch(fileUrl);

        if (!response.ok) {
          console.error('Failed:', fileUrl);
          continue; // skip failed file
        }

        const blob = await response.blob();
        const fileName = fileUrl.split('/').pop();

        zip.file(fileName, blob);
      } catch (err) {
        console.error('Error downloading file:', fileUrl, err);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${folderName}.zip`;
    link.click();

  } catch (err) {
    console.error('ZIP failed:', err);
    alert('Download failed. Try smaller batch.');
  }
};

    return (
        <div style={styles.container}>
            <h1>📂 Gallery</h1>

            {Object.keys(folders).length === 0 && <p>No files found</p>}

            {Object.keys(folders).map(date => (
                <div key={date}>
                    <h2>📅 {date}</h2>

                    {Object.keys(folders[date]).map(user => (
                        <div key={user} style={styles.userBlock}>
                            <div style={styles.header}>
                                <h3>👤 {user}</h3>
                                <button
                                    onClick={() =>
                                        downloadFolder(
                                            folders[date][user].files,
                                            `${date}_${user}`
                                        )
                                    }
                                    style={styles.downloadBtn}
                                >
                                    ⬇️ Download Folder
                                </button>
                                <button
                                    onClick={() => deleteFolder(`${date}/${user}`)}
                                    style={styles.deleteBtn}
                                >
                                    🗑 Delete Folder
                                </button>
                            </div>

                            <p style={styles.size}>
                                📦 {(folders[date][user].totalSize / (1024 * 1024)).toFixed(2)} MB
                            </p>

                            <div style={styles.grid}>
                                {folders[date][user].files.map((url, i) => (
                                    <img key={i} src={url} style={styles.img} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

const styles = {
    container: {
        background: '#0d1117',
        color: '#c9d1d9',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'monospace',
    },

    userBlock: {
        marginBottom: '30px',
        padding: '10px',
        border: '1px solid #30363d',
        borderRadius: '10px',
        background: '#161b22',
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    size: {
        fontSize: '12px',
        color: '#8b949e',
    },

    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, 80px)',
        gap: '8px',
        marginTop: '10px',
    },

    img: {
        width: '80px',
        height: '80px',
        objectFit: 'cover',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: '0.2s',
    },

    deleteBtn: {
        background: '#da3633',
        color: 'white',
        border: 'none',
        padding: '5px 10px',
        borderRadius: '5px',
        cursor: 'pointer',
    },
    downloadBtn: {
        background: '#1f6feb',
        color: 'white',
        border: 'none',
        padding: '5px 10px',
        borderRadius: '5px',
        cursor: 'pointer',
        marginRight: '10px',
    },
};