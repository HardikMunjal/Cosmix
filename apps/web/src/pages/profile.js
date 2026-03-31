import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
    } else {
      const u = JSON.parse(storedUser);
      setUser(u);
      if (u.avatar) setPreview(u.avatar);
    }
  }, [router]);

  const toDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const cartoonizeDataUrl = async (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const w = 300;
        const h = Math.round((img.height / img.width) * w);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // draw image
        ctx.drawImage(img, 0, 0, w, h);

        // posterize / quantize colors
        const imgd = ctx.getImageData(0, 0, w, h);
        const data = imgd.data;
        const levels = 6; // fewer levels = more cartoon
        for (let i = 0; i < data.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            data[i + c] = Math.floor((data[i + c] / 255) * levels) * (255 / (levels - 1));
          }
        }

        // simple edge detection (Sobel approximation)
        const gray = new Uint8ClampedArray(w * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            gray[y * w + x] = v;
          }
        }

        const edges = new Uint8ClampedArray(w * h);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const gx = -gray[(y - 1) * w + (x - 1)] - 2 * gray[y * w + (x - 1)] - gray[(y + 1) * w + (x - 1)]
                      + gray[(y - 1) * w + (x + 1)] + 2 * gray[y * w + (x + 1)] + gray[(y + 1) * w + (x + 1)];
            const gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
                      + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
            const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
            edges[y * w + x] = mag > 60 ? 255 : 0;
          }
        }

        // overlay edges as dark lines
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (edges[y * w + x]) {
              data[idx] = data[idx + 1] = data[idx + 2] = 20; // dark line
            }
          }
        }

        ctx.putImageData(imgd, 0, 0);
        const out = canvas.toDataURL('image/png');
        resolve(out);
      };
      img.src = dataUrl;
    });
  };

  const handleFile = async (file) => {
    try {
      const dataUrl = await toDataURL(file);
      const cartoon = await cartoonizeDataUrl(dataUrl);
      setPreview(cartoon);
    } catch (e) {
      console.error('image read error', e);
    }
  };

  const saveAvatar = () => {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    storedUser.avatar = preview;
    localStorage.setItem('user', JSON.stringify(storedUser));
    setUser(storedUser);
    alert('Avatar saved and cartoonized. It will appear in chat.');
  };

  if (!user) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <button 
        onClick={() => router.push('/dashboard')}
        style={{ padding: '8px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', marginBottom: '20px' }}
      >
        Back to Dashboard
      </button>

      <h1>User Profile</h1>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ marginBottom: '8px' }}><strong>Avatar (cartoonized)</strong></div>
          <div style={{ width: 160, height: 160, borderRadius: 12, overflow: 'hidden', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ color: '#666' }}>No avatar</div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <button onClick={saveAvatar} style={{ padding: '8px 12px', background: '#00ff9f', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Save Avatar</button>
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#f9f9f9', 
          padding: '20px', 
          borderRadius: '4px',
          maxWidth: '520px'
        }}>
          <p><strong>Username:</strong> {user.username}</p>
          <p><strong>Status:</strong> Active</p>
          <p><strong>Member Since:</strong> 2026</p>
          <p style={{ color: '#666' }}>Upload a photo and click <strong>Save Avatar</strong>. The image will be converted to a cartoon-style avatar and used in chat messages.</p>
        </div>
      </div>
    </div>
  );
}
