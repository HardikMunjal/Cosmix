import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Svg, { Line, Polyline } from 'react-native-svg';
import { API_BASE_URL } from '../config';

// NSE market hours: 9:00 AM – 3:30 PM IST, Mon–Fri
function isMarketOpen() {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 540 && total <= 930;
}

const SIDES = ['BUY', 'SELL'];
const OPTION_TYPES = ['CE', 'PE'];
const CHART_W = Dimensions.get('window').width - 32;
const CHART_H = 220;

function makeLeg() {
  return { id: Date.now() + Math.random(), side: 'BUY', type: 'CE', strike: null, premium: '' };
}

function optionIntrinsic(type, strike, spot) {
  return type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}

function legPayoff(leg, spot) {
  const intrinsic = optionIntrinsic(leg.type, Number(leg.strike), spot);
  const premium = Number(leg.premium) || 0;
  const pnl = intrinsic - premium;
  return leg.side === 'BUY' ? pnl : -pnl;
}

export default function OptionsStrategyScreen() {
  const [loading, setLoading] = useState(true);
  const [spot, setSpot] = useState(null);
  const [expiryDates, setExpiryDates] = useState([]);
  const [expiryUnix, setExpiryUnix] = useState([]);
  const [allStrikes, setAllStrikes] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [legs, setLegs] = useState([makeLeg()]);
  const legsRef = useRef(legs);
  legsRef.current = legs;
  const [chainData, setChainData] = useState({});
  const [ivData, setIvData] = useState({ CE: {}, PE: {} });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [dataSource, setDataSource] = useState(null); // 'nse' | 'synthetic-fallback'
  const [secsAgo, setSecsAgo] = useState(0);
  const [pricingModel, setPricingModel] = useState(null);
  const [sourceWarning, setSourceWarning] = useState('');
  const [ivInput, setIvInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  // Ref so refreshLive doesn't need `spot` as a dependency (prevents interval reset on every refresh)
  const spotRef = useRef(spot);
  useEffect(() => { spotRef.current = spot; }, [spot]);
  const pricingInputsRef = useRef({ ivInput: '', rateInput: '' });
  useEffect(() => { pricingInputsRef.current = { ivInput, rateInput }; }, [ivInput, rateInput]);
  const pricingHydratedRef = useRef(false);

  const buildChainUrl = (expiryValue) => {
    const params = new URLSearchParams({ symbol: 'NIFTY' });
    if (expiryValue) params.set('expiry', String(expiryValue));
    if (pricingInputsRef.current.ivInput) params.set('iv', pricingInputsRef.current.ivInput);
    if (pricingInputsRef.current.rateInput) params.set('rate', pricingInputsRef.current.rateInput);
    return `${API_BASE_URL}/api/options-chain?${params.toString()}`;
  };

  // Tick "X sec ago" every second
  useEffect(() => {
    const t = setInterval(() => {
      setSecsAgo(lastUpdated ? Math.round((Date.now() - lastUpdated.getTime()) / 1000) : 0);
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  useEffect(() => { fetchChain(); }, []);

  const fetchChain = async () => {
    setLoading(true);
    try {
      // Step 1: get expiry list
      const res = await fetch(buildChainUrl());
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.spot) setSpot(data.spot);

      const expUnix = data.expirations || [];
      const expLabels = data.expiryDates || expUnix.map((u) => new Date(u * 1000).toDateString());
      setExpiryDates(expLabels);
      setExpiryUnix(expUnix);
      const firstLabel = expLabels[0] || null;
      if (firstLabel) setSelectedExpiry(firstLabel);

      // Step 2: fetch strikes for the first expiry specifically
      const firstUnix = expUnix[0];
      const expParam = firstUnix ? `&expiry=${firstUnix}` : '';
      const er = await fetch(buildChainUrl(firstUnix));
      const ed = await er.json();
      const src = ed.strikes?.length ? ed : data;

      if (src.spot) setSpot(src.spot);
      if (src.source) setDataSource(src.source);

      const uniqueStrikes = [...new Set((src.strikes || []).map((s) => s.strike))]
        .filter((s) => Math.abs(s - (src.spot || data.spot)) <= 1500)
        .sort((a, b) => a - b);
      setAllStrikes(uniqueStrikes);

      const map = { CE: {}, PE: {} };
      const nextIvData = { CE: {}, PE: {} };
      (src.strikes || []).forEach((row) => {
        if (map[row.type]) map[row.type][row.strike] = row.price || row.lastPrice || row.bid || row.ask || 0;
        if (nextIvData[row.type]) nextIvData[row.type][row.strike] = row.iv ?? null;
      });
      setChainData(map);
      setIvData(nextIvData);
      setPricingModel(src.pricingModel || null);
      setSourceWarning(src.warning || '');
      if (!pricingHydratedRef.current && src.pricingModel) {
        setIvInput(String(src.pricingModel.baseIv));
        setRateInput(String(src.pricingModel.riskFreeRate));
        pricingHydratedRef.current = true;
      }
      setLastUpdated(new Date());
      setSecsAgo(0);
    } catch (e) {
      Alert.alert('Options Chain Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshLive = useCallback(async () => {
    if (!selectedExpiry) return;
    setLiveLoading(true);
    try {
      const idx = expiryDates.indexOf(selectedExpiry);
      const expParam = idx >= 0 && expiryUnix[idx] ? `&expiry=${expiryUnix[idx]}` : '';
      const res = await fetch(buildChainUrl(idx >= 0 ? expiryUnix[idx] : null));
      const data = await res.json();
      if (data.spot) setSpot(data.spot);
      if (data.source) setDataSource(data.source);
      if (data.strikes && data.strikes.length) {
        const map = { CE: {}, PE: {} };
        const nextIvData = { CE: {}, PE: {} };
        data.strikes.forEach((row) => {
          if (map[row.type]) map[row.type][row.strike] = row.price || row.lastPrice || row.bid || row.ask || 0;
          if (nextIvData[row.type]) nextIvData[row.type][row.strike] = row.iv ?? null;
        });
        setChainData(map);
        setIvData(nextIvData);
        const curSpot = data.spot || spotRef.current;
        const uniqueStrikes = [...new Set(data.strikes.map((s) => s.strike))]
          .filter((s) => Math.abs(s - curSpot) <= 1500)
          .sort((a, b) => a - b);
        setAllStrikes(uniqueStrikes);
        setLegs((prev) =>
          prev.map((leg) => {
            if (!leg.strike) return leg;
            const p = map[leg.type]?.[Number(leg.strike)];
            return p != null ? { ...leg, premium: String(p) } : leg;
          }),
        );
      }
      setPricingModel(data.pricingModel || null);
      setSourceWarning(data.warning || '');
      setLastUpdated(new Date());
      setSecsAgo(0);
    } catch (_) {} finally {
      setLiveLoading(false);
    }
  }, [selectedExpiry, expiryDates, expiryUnix]); // NO `spot` dep → interval stays stable

  useEffect(() => {
    // Only auto-refresh during market hours
    const tick = () => { if (isMarketOpen()) refreshLive(); };
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [refreshLive]);

  const getPremium = useCallback(
    (type, strike) => {
      const val = chainData?.[type]?.[Number(strike)];
      return val != null ? val : '';
    },
    [chainData],
  );

  // When expiry changes, re-fetch the chain for that expiry and update strikes + leg premiums
  useEffect(() => {
    if (!selectedExpiry) return;
    (async () => {
      try {
        const idx = expiryDates.indexOf(selectedExpiry);
        const expParam = idx >= 0 && expiryUnix[idx]
          ? `&expiry=${expiryUnix[idx]}`
          : '';
        const res = await fetch(buildChainUrl(idx >= 0 ? expiryUnix[idx] : null));
        const data = await res.json();
        if (data.strikes && data.strikes.length) {
          const map = { CE: {}, PE: {} };
          const nextIvData = { CE: {}, PE: {} };
          data.strikes.forEach((row) => {
            if (map[row.type]) map[row.type][row.strike] = row.price || row.lastPrice || row.bid || row.ask || 0;
            if (nextIvData[row.type]) nextIvData[row.type][row.strike] = row.iv ?? null;
          });
          setChainData(map);
          setIvData(nextIvData);
          const uniqueStrikes = [...new Set(data.strikes.map((s) => s.strike))]
            .filter((s) => Math.abs(s - (data.spot || spot)) <= 1500)
            .sort((a, b) => a - b);
          setAllStrikes(uniqueStrikes);
          // Update leg premiums using fresh map (not stale chainData closure)
          setLegs((prev) =>
            prev.map((leg) => {
              if (!leg.strike) return leg;
              const p = map[leg.type]?.[Number(leg.strike)];
              return p != null ? { ...leg, premium: String(p) } : leg;
            }),
          );
        }
        setPricingModel(data.pricingModel || null);
        setSourceWarning(data.warning || '');
      } catch (_) {}
    })();
  }, [selectedExpiry]);

  const updateLeg = useCallback(
    (id, field, value) => {
      const updated = legsRef.current.map((leg) => {
        if (leg.id !== id) return leg;
        const next = { ...leg, [field]: value };
        if ((field === 'strike' || field === 'type') && next.strike) {
          const p = getPremium(next.type, next.strike);
          if (p !== '') next.premium = String(p);
        }
        return next;
      });
      setLegs(updated);
    },
    [getPremium, selectedExpiry],
  );

  const addLeg = () => setLegs((prev) => [...prev, makeLeg()]);
  const removeLeg = (id) => setLegs((prev) => prev.length > 1 ? prev.filter((l) => l.id !== id) : prev);

  const applyModelInputs = useCallback(async () => {
    if (!selectedExpiry) return;
    setLiveLoading(true);
    try {
      const idx = expiryDates.indexOf(selectedExpiry);
      const res = await fetch(buildChainUrl(idx >= 0 ? expiryUnix[idx] : null));
      const data = await res.json();
      if (data.spot) setSpot(data.spot);
      if (data.source) setDataSource(data.source);
      if (data.strikes && data.strikes.length) {
        const map = { CE: {}, PE: {} };
        const nextIvData = { CE: {}, PE: {} };
        data.strikes.forEach((row) => {
          if (map[row.type]) map[row.type][row.strike] = row.price || row.lastPrice || row.bid || row.ask || 0;
          if (nextIvData[row.type]) nextIvData[row.type][row.strike] = row.iv ?? null;
        });
        setChainData(map);
        setIvData(nextIvData);
        const curSpot = data.spot || spotRef.current;
        const uniqueStrikes = [...new Set(data.strikes.map((s) => s.strike))]
          .filter((s) => Math.abs(s - curSpot) <= 1500)
          .sort((a, b) => a - b);
        setAllStrikes(uniqueStrikes);
        setLegs((prev) =>
          prev.map((leg) => {
            if (!leg.strike) return leg;
            const p = map[leg.type]?.[Number(leg.strike)];
            return p != null ? { ...leg, premium: String(p) } : leg;
          }),
        );
      }
      setPricingModel(data.pricingModel || null);
      setSourceWarning(data.warning || '');
      setLastUpdated(new Date());
      setSecsAgo(0);
    } catch (_) {} finally {
      setLiveLoading(false);
    }
  }, [selectedExpiry, expiryDates, expiryUnix]);

  const metrics = useMemo(() => {
    if (!spot || legs.every((l) => !l.strike)) return null;
    const validLegs = legs.filter((l) => l.strike && l.premium !== '');
    if (!validLegs.length) return null;

    const step = 50;
    const range = 2000;
    const points = [];
    for (let s = spot - range; s <= spot + range; s += step) {
      const pnl = validLegs.reduce((sum, leg) => sum + legPayoff(leg, s), 0);
      points.push({ s, pnl });
    }

    const maxPnl = Math.max(...points.map((p) => p.pnl));
    const minPnl = Math.min(...points.map((p) => p.pnl));
    const breakevens = [];
    for (let i = 1; i < points.length; i++) {
      if (
        (points[i - 1].pnl < 0 && points[i].pnl >= 0) ||
        (points[i - 1].pnl >= 0 && points[i].pnl < 0)
      ) {
        breakevens.push(((points[i - 1].s + points[i].s) / 2).toFixed(0));
      }
    }
    const totalDebit = validLegs.reduce(
      (sum, l) => sum + (l.side === 'BUY' ? Number(l.premium) : -Number(l.premium)),
      0,
    );

    return { points, maxPnl, minPnl, breakevens, totalDebit };
  }, [legs, spot]);

  const chartPoints = useMemo(() => {
    if (!metrics) return '';
    const { points, maxPnl, minPnl } = metrics;
    const padY = 20;
    const yRange = Math.max(maxPnl - minPnl, 100);
    const xRange = points[points.length - 1].s - points[0].s;
    return points
      .map(({ s, pnl }) => {
        const x = ((s - points[0].s) / xRange) * CHART_W;
        const y = CHART_H - padY - ((pnl - minPnl) / yRange) * (CHART_H - 2 * padY);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [metrics]);

  const zeroY = useMemo(() => {
    if (!metrics) return CHART_H / 2;
    const { maxPnl, minPnl } = metrics;
    const padY = 20;
    const yRange = Math.max(maxPnl - minPnl, 100);
    return CHART_H - padY - ((0 - minPnl) / yRange) * (CHART_H - 2 * padY);
  }, [metrics]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading options chain…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>NIFTY SPOT</Text>
          <Text style={styles.badgeValue}>{spot?.toFixed(2) ?? '—'}</Text>
          {lastUpdated ? (
            <Text style={{ color: dataSource === 'nse' ? '#22c55e' : '#f59e0b', fontSize: 10, marginTop: 2 }}>
              {dataSource === 'nse' ? '● NSE LIVE' : '⚠ Synthetic'}
              {' · '}{secsAgo < 5 ? 'just now' : `${secsAgo}s ago`}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={liveLoading ? undefined : refreshLive} disabled={liveLoading}>
          <Text style={styles.refreshText}>{liveLoading ? '⟳ Updating…' : '↻ Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {pricingModel ? (
        <View style={styles.modelBox}>
          <Text style={styles.modelText}>Black-Scholes · base IV {pricingModel.baseIv}% · rate {pricingModel.riskFreeRate}% · tenor {pricingModel.timeToExpiryDays}d</Text>
        </View>
      ) : null}
      {sourceWarning ? <Text style={styles.warningText}>{sourceWarning}</Text> : null}
      <View style={styles.modelControls}>
        <View style={styles.modelControlField}>
          <Text style={styles.fieldLabel}>Base IV %</Text>
          <TextInput style={styles.premiumInput} value={ivInput} onChangeText={setIvInput} keyboardType="numeric" />
        </View>
        <View style={styles.modelControlField}>
          <Text style={styles.fieldLabel}>Rate %</Text>
          <TextInput style={styles.premiumInput} value={rateInput} onChangeText={setRateInput} keyboardType="numeric" />
        </View>
      </View>
      <TouchableOpacity style={styles.applyBtn} onPress={liveLoading ? undefined : applyModelInputs} disabled={liveLoading}>
        <Text style={styles.applyBtnText}>{liveLoading ? 'Updating…' : 'Apply Model Inputs'}</Text>
      </TouchableOpacity>

      {/* Expiry picker */}
      <Text style={styles.sectionLabel}>Expiry</Text>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={selectedExpiry}
          onValueChange={setSelectedExpiry}
          style={styles.picker}
          dropdownIconColor="#64748b"
        >
          {expiryDates.map((d) => (
            <Picker.Item key={d} label={d} value={d} color="#e2e8f0" />
          ))}
        </Picker>
      </View>

      {/* Legs */}
      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Strategy Legs</Text>
      {legs.map((leg, idx) => (
        <View key={leg.id} style={styles.legCard}>
          <View style={styles.legHeader}>
            <Text style={styles.legTitle}>Leg {idx + 1}</Text>
            {legs.length > 1 && (
              <TouchableOpacity onPress={() => removeLeg(leg.id)}>
                <Text style={styles.removeText}>✕ Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.legRow}>
            <View style={styles.halfPicker}>
              <Text style={styles.fieldLabel}>Side</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={leg.side}
                  onValueChange={(v) => updateLeg(leg.id, 'side', v)}
                  style={styles.picker}
                  dropdownIconColor="#64748b"
                >
                  {SIDES.map((s) => <Picker.Item key={s} label={s} value={s} color="#e2e8f0" />)}
                </Picker>
              </View>
            </View>
            <View style={styles.halfPicker}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={leg.type}
                  onValueChange={(v) => updateLeg(leg.id, 'type', v)}
                  style={styles.picker}
                  dropdownIconColor="#64748b"
                >
                  {OPTION_TYPES.map((t) => <Picker.Item key={t} label={t} value={t} color="#e2e8f0" />)}
                </Picker>
              </View>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Strike</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={leg.strike}
              onValueChange={(v) => updateLeg(leg.id, 'strike', v)}
              style={styles.picker}
              dropdownIconColor="#64748b"
            >
              <Picker.Item label="— Select Strike —" value={null} color="#64748b" />
              {allStrikes.map((s) => (
                <Picker.Item key={s} label={`${s}`} value={s} color="#e2e8f0" />
              ))}
            </Picker>
          </View>

          <Text style={styles.fieldLabel}>Premium</Text>
          <TextInput
            style={styles.premiumInput}
            value={leg.premium}
            onChangeText={(v) => updateLeg(leg.id, 'premium', v)}
            keyboardType="numeric"
            placeholder="Auto-filled or enter manually"
            placeholderTextColor="#475569"
          />
          <Text style={styles.ivText}>
            {ivData?.[leg.type]?.[Number(leg.strike)] != null ? `IV ${Number(ivData[leg.type][Number(leg.strike)]).toFixed(2)}%` : 'IV —'}
          </Text>
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={addLeg}>
        <Text style={styles.addBtnText}>+ Add Leg</Text>
      </TouchableOpacity>

      {/* Metrics */}
      {metrics && (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Max Profit</Text>
              <Text style={[styles.metricValue, { color: metrics.maxPnl >= 0 ? '#22c55e' : '#f87171' }]}>
                {metrics.maxPnl > 99999 ? '∞' : metrics.maxPnl.toFixed(0)}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Max Loss</Text>
              <Text style={[styles.metricValue, { color: metrics.minPnl < 0 ? '#f87171' : '#22c55e' }]}>
                {metrics.minPnl < -99999 ? '-∞' : metrics.minPnl.toFixed(0)}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Net Debit</Text>
              <Text style={[styles.metricValue, { color: metrics.totalDebit >= 0 ? '#f87171' : '#22c55e' }]}>
                {metrics.totalDebit.toFixed(2)}
              </Text>
            </View>
          </View>
          {metrics.breakevens.length > 0 && (
            <Text style={styles.breakevenText}>
              Breakeven{metrics.breakevens.length > 1 ? 's' : ''}: {metrics.breakevens.join(' / ')}
            </Text>
          )}

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Payoff at Expiry</Text>
          <View style={styles.chartWrap}>
            <Svg width={CHART_W} height={CHART_H}>
              <Line x1={0} y1={zeroY} x2={CHART_W} y2={zeroY} stroke="#334155" strokeWidth={1} strokeDasharray="4 3" />
              <Polyline points={chartPoints} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
            </Svg>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#64748b', marginTop: 12, fontSize: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  badge: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#1e293b' },
  badgeLabel: { color: '#64748b', fontSize: 11, marginBottom: 2 },
  badgeValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  modelBox: { backgroundColor: '#172554', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, borderWidth: 1, borderColor: '#1d4ed8' },
  modelText: { color: '#bfdbfe', fontSize: 12 },
  warningText: { color: '#fbbf24', fontSize: 12, marginBottom: 10, lineHeight: 18 },
  modelControls: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modelControlField: { flex: 1 },
  refreshBtn: { backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#334155' },
  refreshText: { color: '#3b82f6', fontWeight: '600' },
  sectionLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' },
  fieldLabel: { color: '#64748b', fontSize: 11, marginBottom: 4, marginTop: 8 },
  pickerWrap: { backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#1e293b', marginBottom: 2 },
  picker: { color: '#e2e8f0', height: 48 },
  legCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1e293b' },
  legHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  legTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
  removeText: { color: '#f87171', fontSize: 12 },
  legRow: { flexDirection: 'row', gap: 8 },
  halfPicker: { flex: 1 },
  premiumInput: {
    backgroundColor: '#020617', color: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
    borderColor: '#334155', fontSize: 15, marginBottom: 4,
  },
  ivText: { color: '#94a3b8', fontSize: 11 },
  applyBtn: { backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  applyBtnText: { color: '#eff6ff', fontWeight: '700', fontSize: 14 },
  addBtn: { borderWidth: 1, borderColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: '#3b82f6', fontWeight: '700', fontSize: 15 },
  metricsRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  metricBox: { flex: 1, backgroundColor: '#0f172a', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1e293b', alignItems: 'center' },
  metricLabel: { color: '#64748b', fontSize: 11, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  breakevenText: { color: '#94a3b8', fontSize: 13, marginTop: 10, textAlign: 'center' },
  chartWrap: { marginTop: 8, backgroundColor: '#0f172a', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: '#1e293b' },
});
