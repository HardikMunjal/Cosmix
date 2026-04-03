import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_BASE_URL } from '../config';

const DEFAULT_SPOT = '22600';
const DEFAULT_STRIKES = '22500,22600,22700';
const DEFAULT_EXPIRIES = '2026-04-07,2026-04-14';

function currency(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `Rs. ${Number(value).toFixed(2)}`;
}

export default function ExpectedOptionPricesScreen() {
  const [spot, setSpot] = useState(DEFAULT_SPOT);
  const [strikes, setStrikes] = useState(DEFAULT_STRIKES);
  const [expiries, setExpiries] = useState(DEFAULT_EXPIRIES);
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        symbol: 'NIFTY',
        spot,
        strikes,
        expiries,
      });
      if (rate) params.set('rate', rate);
      const response = await fetch(`${API_BASE_URL}/api/options-expected-price?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch expected option prices');
      setPayload(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const groupedContracts = useMemo(() => {
    const map = new Map();
    (payload?.contracts || []).forEach((contract) => {
      if (!map.has(contract.expiryLabel)) map.set(contract.expiryLabel, []);
      map.get(contract.expiryLabel).push(contract);
    });
    return Array.from(map.entries());
  }, [payload]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Formula-based pricing</Text>
        <Text style={styles.title}>Expected Option Prices</Text>
        <Text style={styles.subtitle}>CE and PE estimates for 22500, 22600 and 22700 across selected weekly expiries.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Scenario</Text>

        <Text style={styles.label}>Reference spot</Text>
        <TextInput value={spot} onChangeText={setSpot} style={styles.input} placeholderTextColor="#475569" keyboardType="numeric" />

        <Text style={styles.label}>Strikes</Text>
        <TextInput value={strikes} onChangeText={setStrikes} style={styles.input} placeholderTextColor="#475569" />

        <Text style={styles.label}>Expiries</Text>
        <TextInput value={expiries} onChangeText={setExpiries} style={styles.input} placeholderTextColor="#475569" />

        <Text style={styles.label}>Rate override (%)</Text>
        <TextInput value={rate} onChangeText={setRate} style={styles.input} placeholder="Optional" placeholderTextColor="#475569" keyboardType="numeric" />

        <TouchableOpacity style={styles.primaryButton} onPress={() => loadData()} disabled={loading}>
          <Text style={styles.primaryButtonText}>{loading ? 'Calculating…' : 'Calculate expected prices'}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !payload ? <ActivityIndicator size="large" color="#38bdf8" style={{ marginVertical: 28 }} /> : null}

      {payload ? (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Reference spot</Text>
              <Text style={styles.summaryValue}>{currency(payload.referenceSpot)}</Text>
              <Text style={styles.summaryMeta}>Live {currency(payload.liveSpot)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>India VIX</Text>
              <Text style={styles.summaryValue}>{payload.sources.volatilityIndex.value?.toFixed(2) ?? '—'}</Text>
              <Text style={styles.summaryMeta}>{payload.sources.volatilityIndex.source}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Open-source inputs</Text>
            <Text style={styles.sourceText}>Spot: {payload.sources.spot.source}</Text>
            <Text style={styles.sourceText}>Volatility index: {payload.sources.volatilityIndex.source}</Text>
            <Text style={styles.sourceText}>Option-chain IV: {payload.sources.optionsChain.source}</Text>
            <Text style={styles.sourceText}>Rate: {payload.sources.riskFreeRate.note}</Text>
            {payload.sources.candidateOpenSources.map((source) => (
              <Text key={source} style={styles.sourceBullet}>• {source}</Text>
            ))}
          </View>

          {groupedContracts.map(([expiryLabel, contracts]) => (
            <View key={expiryLabel} style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{expiryLabel}</Text>
                <TouchableOpacity onPress={() => loadData(true)} disabled={refreshing}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>

              {contracts.map((contract) => (
                <View key={`${contract.expiryUnix}-${contract.strike}-${contract.type}`} style={styles.contractCard}>
                  <Text style={styles.contractTitle}>{contract.strike} {contract.type}</Text>
                  <Text style={styles.contractMeta}>Live premium {currency(contract.livePremium)}</Text>
                  <Text style={styles.contractMeta}>Applied IV {contract.appliedVolatility}% via {contract.volatilitySource}</Text>

                  <View style={styles.formulaList}>
                    {contract.formulaResults.map((formula) => (
                      <View key={formula.key} style={styles.formulaCard}>
                        <Text style={styles.formulaName}>{formula.name}</Text>
                        <Text style={styles.formulaPrice}>{currency(formula.price)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#031018' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  header: { marginBottom: 8 },
  eyebrow: { color: '#38bdf8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 8 },
  title: { color: '#e2e8f0', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 20 },
  card: { backgroundColor: '#071722', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#163246' },
  sectionTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  label: { color: '#7dd3fc', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#020617', borderRadius: 12, borderWidth: 1, borderColor: '#1d4f74', color: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 12 },
  primaryButton: { marginTop: 16, backgroundColor: '#22c55e', borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  primaryButtonText: { color: '#031018', fontWeight: '800' },
  errorBox: { backgroundColor: '#3f1111', borderColor: '#7f1d1d', borderWidth: 1, borderRadius: 14, padding: 12 },
  errorText: { color: '#fecaca' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, backgroundColor: '#082131', borderRadius: 18, borderWidth: 1, borderColor: '#1d4f74', padding: 14 },
  summaryLabel: { color: '#7dd3fc', fontSize: 12, textTransform: 'uppercase' },
  summaryValue: { color: '#e2e8f0', fontSize: 24, fontWeight: '800', marginTop: 10 },
  summaryMeta: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
  sourceText: { color: '#dbeafe', fontSize: 13, marginBottom: 8 },
  sourceBullet: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshText: { color: '#38bdf8', fontWeight: '700' },
  contractCard: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#163246' },
  contractTitle: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  contractMeta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  formulaList: { marginTop: 12, gap: 10 },
  formulaCard: { backgroundColor: '#031018', borderRadius: 14, borderWidth: 1, borderColor: '#1d4f74', padding: 12 },
  formulaName: { color: '#93c5fd', fontSize: 12 },
  formulaPrice: { color: '#f8fafc', fontSize: 22, fontWeight: '800', marginTop: 8 },
});