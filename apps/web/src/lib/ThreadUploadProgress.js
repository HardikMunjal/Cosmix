import { useEffect, useMemo, useState } from 'react';

function fileLabel(name, max = 28) {
  const value = String(name || 'file');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function createUploadSession(files = []) {
  const list = Array.from(files || []);
  return {
    active: list.length > 0,
    total: list.length,
    completed: 0,
    failed: 0,
    currentIndex: 0,
    currentName: list[0]?.name || '',
    currentPhase: 'preparing',
    overallPercent: 0,
    fileStates: list.map((file) => ({
      name: file.name,
      size: file.size,
      percent: 0,
      status: 'pending',
    })),
    message: 'Preparing upload…',
  };
}

export function ThreadUploadProgress({ session, onDismiss }) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!session?.active) return undefined;
    const timer = setInterval(() => setPulse((value) => (value + 1) % 360), 40);
    return () => clearInterval(timer);
  }, [session?.active]);

  const done = session && session.completed + session.failed >= session.total && session.total > 0;
  const gradientShift = useMemo(
    () => `linear-gradient(90deg, #22d3ee, #818cf8, #f97316, #22d3ee)`,
    [],
  );

  if (!session?.active) return null;

  return (
    <div className="thread-upload-progress" role="status" aria-live="polite">
      <style>{`
        .thread-upload-progress {
          border-radius: 18px;
          border: 1px solid rgba(56,189,248,0.28);
          background: radial-gradient(circle at 20% 0%, rgba(34,211,238,0.12), transparent 42%),
            radial-gradient(circle at 80% 100%, rgba(129,140,248,0.14), transparent 45%),
            rgba(2,6,23,0.92);
          padding: 14px;
          display: grid;
          gap: 12px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.35);
        }
        .thread-upload-progress-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .thread-upload-progress-title {
          font-size: 14px;
          font-weight: 900;
          color: #f8fafc;
        }
        .thread-upload-progress-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 700;
        }
        .thread-upload-progress-track {
          position: relative;
          height: 14px;
          border-radius: 999px;
          background: rgba(15,23,42,0.9);
          overflow: hidden;
          border: 1px solid rgba(148,163,184,0.18);
        }
        .thread-upload-progress-fill {
          height: 100%;
          border-radius: inherit;
          background-size: 220% 100%;
          transition: width 0.25s ease;
          box-shadow: 0 0 18px rgba(34,211,238,0.45);
        }
        .thread-upload-progress-spark {
          position: absolute;
          top: 50%;
          width: 10px;
          height: 10px;
          margin-top: -5px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 0 16px #22d3ee, 0 0 28px #818cf8;
          transition: left 0.25s ease;
        }
        .thread-upload-progress-grid {
          display: grid;
          gap: 6px;
          max-height: 160px;
          overflow: auto;
        }
        .thread-upload-progress-file {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          font-size: 11px;
          color: #cbd5e1;
        }
        .thread-upload-progress-file-bar {
          grid-column: 1 / -1;
          height: 4px;
          border-radius: 999px;
          background: rgba(148,163,184,0.16);
          overflow: hidden;
        }
        .thread-upload-progress-file-bar > span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #38bdf8, #a855f7);
          transition: width 0.2s ease;
        }
        .thread-upload-progress-badge {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.22);
        }
        .thread-upload-progress-badge.is-done { color: #4ade80; border-color: rgba(74,222,128,0.35); }
        .thread-upload-progress-badge.is-active { color: #67e8f9; border-color: rgba(103,232,249,0.35); }
        .thread-upload-progress-badge.is-error { color: #fb7185; border-color: rgba(251,113,133,0.35); }
        .thread-upload-progress-dismiss {
          appearance: none;
          border: none;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: rgba(56,189,248,0.16);
          color: #bae6fd;
          justify-self: start;
        }
      `}</style>

      <div className="thread-upload-progress-head">
        <div>
          <div className="thread-upload-progress-title">
            {done ? 'Upload complete' : `Uploading ${session.completed + 1} of ${session.total}`}
          </div>
          <div className="thread-upload-progress-sub">{session.message}</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#67e8f9' }}>{Math.round(session.overallPercent)}%</div>
      </div>

      <div className="thread-upload-progress-track">
        <div
          className="thread-upload-progress-fill"
          style={{
            width: `${Math.max(4, session.overallPercent)}%`,
            backgroundImage: gradientShift,
            backgroundPosition: `${pulse % 100}% 0`,
          }}
        />
        {!done ? (
          <div
            className="thread-upload-progress-spark"
            style={{ left: `calc(${Math.max(4, session.overallPercent)}% - 5px)` }}
          />
        ) : null}
      </div>

      <div className="thread-upload-progress-grid">
        {session.fileStates.map((file, index) => (
          <div key={`${file.name}-${index}`} className="thread-upload-progress-file">
            <span>{fileLabel(file.name)}</span>
            <span className={`thread-upload-progress-badge${file.status === 'done' ? ' is-done' : file.status === 'error' ? ' is-error' : file.status === 'active' ? ' is-active' : ''}`}>
              {file.status === 'done' ? 'Done' : file.status === 'error' ? 'Failed' : file.status === 'active' ? 'Uploading' : 'Queued'}
            </span>
            <div className="thread-upload-progress-file-bar">
              <span style={{ width: `${file.percent}%` }} />
            </div>
          </div>
        ))}
      </div>

      {done ? (
        <button type="button" className="thread-upload-progress-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function xhrUploadFormData(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }
        reject(new Error(payload?.error || `Upload failed (${xhr.status})`));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}
