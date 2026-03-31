import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');

  const handleLogin = async () => {
    const name = username.trim();
    if (!name) return;
    await AsyncStorage.setItem('user', JSON.stringify({ username: name }));
    navigation.replace('Dashboard');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.box}>
        <Text style={styles.brand}>Cosmix</Text>
        <Text style={styles.sub}>Trading & Chat Platform</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#475569"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity style={[styles.btn, !username.trim() && styles.btnOff]} onPress={handleLogin} disabled={!username.trim()}>
          <Text style={styles.btnText}>Enter</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  box: { width: '85%', backgroundColor: '#0f172a', borderRadius: 16, padding: 32, borderWidth: 1, borderColor: '#1e293b' },
  brand: { color: '#e2e8f0', fontSize: 32, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  sub: { color: '#475569', fontSize: 13, textAlign: 'center', marginBottom: 32, marginTop: 4 },
  input: { backgroundColor: '#020617', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#334155', fontSize: 16, marginBottom: 16 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnOff: { backgroundColor: '#1e293b' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
