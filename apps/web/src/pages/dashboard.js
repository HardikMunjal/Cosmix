import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [indices, setIndices] = useState([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  useEffect(() => {
    const loadIndices = async () => {
      try {
        const response = await fetch('/api/market-indices');
        const data = await response.json();
        if (response.ok) {
          setIndices(data.indices || []);
        }
      } catch (error) {
        console.error('indices error', error);
      }
    };

    loadIndices();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
  };

  if (!user) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>⚡ Welcome, {user.username}</h1>
        <button onClick={handleLogout} style={styles.logout}>
          Logout
        </button>
      </div>

      {indices.length > 0 && (
        <div style={styles.marketStrip}>
          {indices.map((index) => (
            <div key={index.key} style={styles.marketCard}>
              <div style={styles.marketName}>{index.name}</div>
              <div style={styles.marketPrice}>Rs. {index.price.toFixed(2)}</div>
              <div style={{ ...styles.marketMove, color: index.change >= 0 ? '#2dd4bf' : '#f87171' }}>
                {index.change >= 0 ? '+' : ''}{index.change.toFixed(2)} ({index.changePercent >= 0 ? '+' : ''}{Number(index.changePercent).toFixed(2)}%)
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Services */}
      <div style={styles.grid}>
        <Card title="💬 Chat" desc="Real-time chat system" onClick={() => router.push('/chat')} />
        <Card title="📸 Media Gallery" desc="Batch upload & manage ZIPs" onClick={() => router.push('/media')} />
        <Card title="📈 Nifty 50" desc="Create live NSE strategies" onClick={() => router.push('/stocks')} />
        <Card title="🧮 Nifty Options" desc="Calculate payoff, max loss and max profit" onClick={() => router.push('/options-strategy')} />
        <Card title="🖼️ Gallery" desc="View uploaded media" onClick={() => router.push('/gallery')} />
        <Card title="👤 Profile" desc="View your profile" onClick={() => router.push('/profile')} />
      </div>
    </div>
  );
}

/* Reusable Card */
function Card({ title, desc, onClick }) {
  return (
    <div style={styles.card} onClick={onClick}>
      <h2>{title}</h2>
      <p style={styles.desc}>{desc}</p>
    </div>
  );
}

/* Styles */
const styles = {
  container: {
    background: '#0d1117',
    minHeight: '100vh',
    padding: '40px',
    color: '#c9d1d9',
    fontFamily: 'monospace',
  },

  loading: {
    background: '#0d1117',
    color: '#c9d1d9',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
    gap: '16px',
    flexWrap: 'wrap',
  },

  title: {
    color: '#58a6ff',
  },

  logout: {
    background: '#da3633',
    border: 'none',
    padding: '10px 15px',
    color: 'white',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
  },

  marketStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },

  marketCard: {
    background: 'linear-gradient(135deg, #0f172a, #111827)',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #1f2937',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
  },

  marketName: {
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '6px',
  },

  marketPrice: {
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },

  marketMove: {
    fontSize: '13px',
    fontWeight: 'bold',
  },

  card: {
    background: '#161b22',
    padding: '20px',
    borderRadius: '10px',
    border: '1px solid #30363d',
    cursor: 'pointer',
    transition: '0.2s',
  },

  desc: {
    color: '#8b949e',
  },
};

/* Hover effect (hack for inline styles) */
if (typeof window !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    div[style*="cursor: pointer"]:hover {
      transform: translateY(-5px);
      border-color: #58a6ff !important;
      box-shadow: 0 0 15px rgba(88,166,255,0.3);
    }
  `;
  document.head.appendChild(style);
}