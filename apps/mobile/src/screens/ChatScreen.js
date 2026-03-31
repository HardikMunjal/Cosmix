import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { showMessageNotification } from '../utils/notifications';
import { CHAT_SERVICE_URL } from '../config';

export default function ChatScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const socketRef = useRef(null);
  const flatListRef = useRef(null);
  const userRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('user').then((u) => {
      if (!u) { navigation.replace('Login'); return; }
      const userData = JSON.parse(u);
      setUser(userData);
      userRef.current = userData;
      initSocket(userData);
    });
    return () => { socketRef.current?.disconnect(); };
  }, []);

  const initSocket = (userData) => {
    const socket = io(CHAT_SERVICE_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { username: userData.username });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('message', async (data) => {
      setMessages((prev) => [...prev, { ...data, _key: String(Date.now() + Math.random()) }]);
      if (data.username !== userRef.current?.username) {
        await showMessageNotification(
          data.username || 'Someone',
          data.message || data.text || 'New message',
        );
      }
    });

    socket.on('typing', (data) => {
      if (data.username !== userRef.current?.username) {
        setTypingUsers((prev) =>
          data.isTyping
            ? [...new Set([...prev, data.username])]
            : prev.filter((u) => u !== data.username),
        );
      }
    });
  };

  const handleTyping = (text) => {
    setInput(text);
    socketRef.current?.emit('typing', { username: userRef.current?.username, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', { username: userRef.current?.username, isTyping: false });
    }, 1500);
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('message', {
      username: userRef.current?.username,
      message: text,
      timestamp: new Date().toISOString(),
    });
    socketRef.current.emit('typing', { username: userRef.current?.username, isTyping: false });
    setInput('');
  };

  const renderMessage = ({ item }) => {
    const isMe = item.username === userRef.current?.username;
    const time = item.timestamp
      ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && <Text style={styles.msgUser}>{item.username}</Text>}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {item.message || item.text}
          </Text>
        </View>
        {time ? <Text style={styles.msgTime}>{time}</Text> : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.statusBar}>
        <View style={[styles.dot, { backgroundColor: connected ? '#22c55e' : '#f87171' }]} />
        <Text style={styles.statusText}>{connected ? 'Connected' : 'Reconnecting…'}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._key}
        renderItem={renderMessage}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hi! 👋</Text>}
      />

      {typingUsers.length > 0 && (
        <Text style={styles.typing}>
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
        </Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={handleTyping}
          placeholder="Type a message…"
          placeholderTextColor="#475569"
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          blurOnSubmit={false}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && styles.sendBtnOff]}
          onPress={sendMessage}
          disabled={!input.trim()}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 8, borderBottomWidth: 1, borderColor: '#1e293b', backgroundColor: '#0f172a',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: '#94a3b8', fontSize: 12 },
  listContent: { padding: 12, paddingBottom: 4 },
  empty: { color: '#334155', textAlign: 'center', marginTop: 60, fontSize: 14 },
  msgRow: { marginVertical: 4, maxWidth: '80%' },
  msgRowMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  msgUser: { color: '#64748b', fontSize: 11, marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#1e293b', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#334155',
  },
  bubbleText: { color: '#e2e8f0', fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  msgTime: { color: '#334155', fontSize: 10, marginTop: 2, marginHorizontal: 4 },
  typing: { color: '#475569', fontSize: 12, paddingHorizontal: 16, paddingVertical: 4, fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10,
    backgroundColor: '#0f172a', borderTopWidth: 1, borderColor: '#1e293b',
  },
  input: {
    flex: 1, backgroundColor: '#020617', color: '#e2e8f0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1,
    borderColor: '#334155', maxHeight: 100, marginRight: 8,
  },
  sendBtn: { backgroundColor: '#3b82f6', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnOff: { backgroundColor: '#1e293b' },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
