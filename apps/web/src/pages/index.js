import { useRouter } from 'next/router';
import { useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username || username.trim().length === 0) {
      setError('Please enter a username');
      return;
    }
    const user = { username: username.trim() };
    localStorage.setItem('user', JSON.stringify(user));
    router.push('/dashboard');
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '16px'
    }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '40px', 
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1>Cosmix Login</h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '15px' }}>
            <label>Username</label>
            <input 
              type="text" 
              placeholder="your-username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button 
            type="submit"
            style={{ 
              width: '100%', 
              padding: '10px', 
              backgroundColor: '#007bff', 
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
