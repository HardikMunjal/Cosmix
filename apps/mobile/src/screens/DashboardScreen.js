import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

const INDICES = [
  { key: 'NIFTY50', label: 'NIFTY 50' },
  { key: 'BANKNIFTY', label: 'BANK NIFTY' },
  { key: 'SENSEX', label: 'SENSEX' },
];

export default function DashboardScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [indices, setIndices] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('user').then((u) => {
      if (!u) { navigation.replace('Login'); return; }
      setUser(JSON.parse(u));
    });
    fetchIndices();
  }, []);

  const fetchIndices = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/market-indices`);
      const data = await res.json();
      const map = {};
      (data.indices || data || []).forEach((item) => { map[item.symbol] = item; });
      setIndices(map);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user');
    navigation.replace('Login');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchIndices(true)} tintColor="#3b82f6" />}
    >
      <View style={styles.header}>
        <Text style={styles.welcome}>Hi, {user?.username ?? '…'} 👋</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logout}>Logout</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Market Overview</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginVertical: 24 }} />
      ) : (
        <View style={styles.indicesRow}>
          {INDICES.map(({ key, label }) => {
            const item = indices[key];
            const change = item?.changePercent ?? item?.pChange ?? 0;
            const up = change >= 0;
            return (
              <View key={key} style={styles.indexCard}>
                <Text style={styles.indexLabel}>{label}</Text>
                <Text style={styles.indexValue}>{item?.lastPrice?.toFixed(2) ?? '—'}</Text>
                <Text style={[styles.indexChange, { color: up ? '#22c55e' : '#f87171' }]}>
                  {up ? '+' : ''}{change?.toFixed(2)}%
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Quick Access</Text>
      <View style={styles.navGrid}>
        <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('Chat')}>
          <Text style={styles.navIcon}>💬</Text>
          <Text style={styles.navLabel}>Chat</Text>
          <Text style={styles.navSub}>Real-time messaging</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('OptionsStrategy')}>
          <Text style={styles.navIcon}>📈</Text>
          <Text style={styles.navLabel}>Options Strategy</Text>
          <Text style={styles.navSub}>Live chain + payoff</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('ExpectedOptionPrices')}>
          <Text style={styles.navIcon}>🧮</Text>
          <Text style={styles.navLabel}>Expected Prices</Text>
          <Text style={styles.navSub}>CE/PE via multiple formulas</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  welcome: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  logout: { color: '#f87171', fontSize: 13 },
  sectionLabel: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  indicesRow: { flexDirection: 'row', gap: 8 },
  indexCard: { flex: 1, backgroundColor: '#0f172a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e293b', alignItems: 'center' },
  indexLabel: { color: '#64748b', fontSize: 10, marginBottom: 6, textAlign: 'center' },
  indexValue: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  indexChange: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  navGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  navCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#0f172a', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#1e293b' },
  navIcon: { fontSize: 28, marginBottom: 8 },
  navLabel: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
  navSub: { color: '#475569', fontSize: 12, marginTop: 3 },
});
