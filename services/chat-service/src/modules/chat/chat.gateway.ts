import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly chatService: ChatService) {}

  @WebSocketServer()
  server!: Server;

  /* 🔥 Better Data Structure */
  private users = new Map<string, string>(); // socketId -> username
  private userSockets = new Map<string, Set<string>>(); // username -> socketIds
  private userActors = new Map<string, { username: string; userId?: string | null; avatar?: string | null }>();
  private callParticipants = new Map<string, Map<string, { username: string; userId?: string | null; avatar?: string | null; joinedAt: string }>>();

  private watchRoomId(room: string) {
    return `call-watch:${room}`;
  }

  private callStatusSnapshot() {
    return Array.from(this.callParticipants.entries()).map(([room, participants]) => ({
      room,
      count: participants.size,
    }));
  }

  private emitCallStatus(room: string) {
    const count = this.callParticipants.get(room)?.size || 0;
    this.server.emit('call_status', { room, count });
  }

  private emitCallPresence(room: string) {
    const participants = Array.from(this.callParticipants.get(room)?.values() || []);
    this.server.to(this.watchRoomId(room)).emit('call_presence', { room, participants });
    this.emitCallStatus(room);
  }

  private removeSocketFromCallPresence(socketId: string) {
    for (const [room, participants] of this.callParticipants.entries()) {
      if (!participants.has(socketId)) continue;
      participants.delete(socketId);
      if (!participants.size) {
        this.callParticipants.delete(room);
      }
      this.emitCallPresence(room);
    }
  }

  /* 🟢 CONNECT */
  handleConnection(socket: Socket) {
    console.log('User connected:', socket.id);
  }

  /* 🔴 DISCONNECT */
  handleDisconnect(socket: Socket) {
    const username = this.users.get(socket.id);
    this.removeSocketFromCallPresence(socket.id);

    if (username) {
      this.users.delete(socket.id);
      const socketIds = this.userSockets.get(username);
      if (socketIds) {
        socketIds.delete(socket.id);
        if (!socketIds.size) {
          this.userSockets.delete(username);
        }
      }
      this.userActors.delete(socket.id);

      this.server.emit('online_users', this.getOnlineUsers());

      console.log(`${username} disconnected`);
    }
  }

  /* 👤 JOIN USER */
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: { username: string; userId?: string | null; avatar?: string | null },
    @ConnectedSocket() socket: Socket,
  ) {
    const { username } = data;

    socket.data.username = username;
    socket.data.userId = data.userId || null;
    socket.data.avatar = data.avatar || null;

    this.users.set(socket.id, username);
    const socketIds = this.userSockets.get(username) || new Set<string>();
    socketIds.add(socket.id);
    this.userSockets.set(username, socketIds);
    this.userActors.set(socket.id, { username, userId: data.userId || null, avatar: data.avatar || null });

    this.server.emit('online_users', this.getOnlineUsers());
    socket.emit('call_status_snapshot', this.callStatusSnapshot());

    console.log(`${username} joined`);
  }

  @SubscribeMessage('call_status_snapshot')
  handleCallStatusSnapshot(
    @ConnectedSocket() socket: Socket,
  ) {
    socket.emit('call_status_snapshot', this.callStatusSnapshot());
  }

  /* 🏠 JOIN ROOM */
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.join(data.room);
    console.log(`${socket.data.username} joined room ${data.room}`);
  }

  @SubscribeMessage('open_chat')
  async handleOpenChat(
    @MessageBody() data: { chat: { type: 'group' | 'dm'; id?: string; name: string } },
    @ConnectedSocket() socket: Socket,
  ) {
    const username = this.users.get(socket.id);
    if (!username) return;

    if (data.chat.type === 'group') {
      socket.join(this.chatService.getRoomId(data.chat, username));
    }

    try {
      const recentMessages = await this.chatService.getMessagesForChat(data.chat, username);
      socket.emit('history', {
        chat: { ...data.chat, id: data.chat.id || this.chatService.getRoomId(data.chat, username) },
        messages: recentMessages,
      });
    } catch (error) {
      socket.emit('chat_error', { message: error instanceof Error ? error.message : 'Could not load chat history.' });
    }
  }

  /* 💬 MESSAGE HANDLER */
  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody()
    data: {
      type: 'text' | 'gif';
      text?: string;
      gif?: string;
      chat: { type: 'group' | 'dm'; name: string };
      timestamp: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    const sender = this.users.get(socket.id);
    const actor = this.userActors.get(socket.id);

    if (!sender || !actor) {
      socket.emit('chat_error', { message: 'Connection not ready. Please wait a moment and try again.' });
      return;
    }

    let payload;
    try {
      payload = await this.chatService.sendMessage(actor, {
        ...data,
        user: sender,
        userId: actor.userId || null,
        avatar: actor.avatar || null,
      });
    } catch (error) {
      socket.emit('chat_error', { message: error instanceof Error ? error.message : 'Could not send message.' });
      return;
    }
    // COMMAND / AI HANDLING
    if (data.type === 'text' && data.text) {
      const text = data.text.trim();

      // Commands: /summarize, /explain, /joke  or mention @ai
      if (text.startsWith('/summarize') || text.startsWith('/explain') || text.startsWith('/joke') || text.startsWith('@ai')) {
        const aiResponse = this.handleAICommand(text, sender);

        const aiPayload = {
          type: 'text',
          text: aiResponse,
          chat: data.chat,
          timestamp: new Date().toLocaleTimeString(),
          user: 'ai-bot',
        };

        // emit AI response into the same chat
        if (data.chat.type === 'group') {
          this.server.to(payload.chat.id || data.chat.name).emit('message', aiPayload);
        } else {
          // DM - reply to both
          const targetSocketIds = this.userSockets.get(data.chat.name);
          targetSocketIds?.forEach((targetSocketId) => {
            this.server.to(targetSocketId).emit('message', aiPayload);
          });
          socket.emit('message', aiPayload);
        }

        // continue to also forward original message below
      }
    }

    /* 👥 GROUP CHAT */
    if (data.chat.type === 'group') {
      this.server.to(payload.chat.id || data.chat.name).emit('message', payload);
    }

    /* 👤 DIRECT MESSAGE */
    if (data.chat.type === 'dm') {
      const targetUsername = data.chat.name;
      const targetSocketIds = this.userSockets.get(targetUsername);

      if (targetSocketIds?.size) {
        const receiverPayload = { ...payload };
        targetSocketIds.forEach((targetSocketId) => {
          this.server.to(targetSocketId).emit('message', receiverPayload);
        });
      }

      // Always send back to sender so UI updates even if recipient is offline.
      socket.emit('message', payload);
    }

    console.log('Message:', payload);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { user: string; chat: { type: string; name: string; id?: string } },
    @ConnectedSocket() socket: Socket,
  ) {
    // Broadcast typing to room or to DM target
    if (data.chat?.type === 'group') {
      this.server.to(data.chat.id || data.chat.name).emit('typing', { user: data.user });
    } else if (data.chat?.type === 'dm') {
      const targetSocketIds = this.userSockets.get(data.chat.name);
      targetSocketIds?.forEach((targetSocketId) => {
        this.server.to(targetSocketId).emit('typing', { user: data.user });
      });
    }
  }

  @SubscribeMessage('call_presence_watch')
  handleCallPresenceWatch(
    @MessageBody() data: { room: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = String(data?.room || '').trim();
    if (!room) return;
    socket.join(this.watchRoomId(room));
    this.emitCallPresence(room);
  }

  @SubscribeMessage('call_presence_unwatch')
  handleCallPresenceUnwatch(
    @MessageBody() data: { room: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = String(data?.room || '').trim();
    if (!room) return;
    socket.leave(this.watchRoomId(room));
  }

  @SubscribeMessage('call_join')
  handleCallJoin(
    @MessageBody() data: { room: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = String(data?.room || '').trim();
    const actor = this.userActors.get(socket.id);
    if (!room || !actor?.username) return;

    let participants = this.callParticipants.get(room);
    if (!participants) {
      participants = new Map();
      this.callParticipants.set(room, participants);
    }
    participants.set(socket.id, {
      username: actor.username,
      userId: actor.userId || null,
      avatar: actor.avatar || null,
      joinedAt: new Date().toISOString(),
    });
    socket.join(this.watchRoomId(room));
    this.emitCallPresence(room);
  }

  @SubscribeMessage('call_leave')
  handleCallLeave(
    @MessageBody() data: { room: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = String(data?.room || '').trim();
    if (!room) return;
    const participants = this.callParticipants.get(room);
    if (!participants) return;
    participants.delete(socket.id);
    if (!participants.size) {
      this.callParticipants.delete(room);
    }
    this.emitCallPresence(room);
  }

  /* 🔎 Simple local AI command handler (open-source/mock) */
  private handleAICommand(commandText: string, sender: string): string {
    const lower = commandText.toLowerCase();

    if (lower.startsWith('/joke')) {
      const jokes = [
        "Why did the programmer quit his job? Because he didn't get arrays.",
        "I told my computer I needed a break, and it said no problem — it needed one too.",
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }

    if (lower.startsWith('/summarize')) {
      // naive summary: return first sentence or truncated
      const parts = commandText.replace('/summarize', '').trim();
      if (!parts) return 'Please provide text after /summarize to summarize.';
      return parts.split(/[\.\!\?]\s/)[0] + '...';
    }

    if (lower.startsWith('/explain')) {
      const topic = commandText.replace('/explain', '').trim() || 'that topic';
      return `Here's a brief explanation of ${topic}: This is a concise, developer-friendly explanation (mock).`;
    }

    if (lower.startsWith('@ai')) {
      const prompt = commandText.replace('@ai', '').trim();
      if (!prompt) return 'Hello! Ask me something like: @ai what is event loop?';
      return `AI mock answer to: "${prompt}" — (this is a local open-source mock response).`;
    }

    return 'AI: command not recognized.';
  }

  /* 🧠 UTIL */
  private getOnlineUsers(): string[] {
    return Array.from(this.userSockets.entries())
      .filter(([, socketIds]) => socketIds.size > 0)
      .map(([username]) => username);
  }
}