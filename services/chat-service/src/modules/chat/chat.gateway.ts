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
  private userSockets = new Map<string, string>(); // username -> socketId

  /* 🟢 CONNECT */
  handleConnection(socket: Socket) {
    console.log('User connected:', socket.id);
  }

  /* 🔴 DISCONNECT */
  handleDisconnect(socket: Socket) {
    const username = this.users.get(socket.id);

    if (username) {
      this.users.delete(socket.id);
      this.userSockets.delete(username);

      this.server.emit('online_users', this.getOnlineUsers());

      console.log(`${username} disconnected`);
    }
  }

  /* 👤 JOIN USER */
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: { username: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const { username } = data;

    socket.data.username = username;

    this.users.set(socket.id, username);
    this.userSockets.set(username, socket.id);

    /* Auto join default room */
    socket.join('general');

    const recentMessages = await this.chatService.getMessagesForChat({ type: 'group', name: 'general' }, username);
    if (recentMessages.length) {
      socket.emit('history', { chat: { type: 'group', name: 'general' }, messages: recentMessages });
    }

    this.server.emit('online_users', this.getOnlineUsers());

    console.log(`${username} joined`);
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

    if (!sender) return;

    const payload = {
      ...data,
      user: sender,
    };
    await this.chatService.sendMessage(payload);
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
          this.server.to(data.chat.name).emit('message', aiPayload);
        } else {
          // DM - reply to both
          const targetSocketId = this.userSockets.get(data.chat.name);
          if (targetSocketId) this.server.to(targetSocketId).emit('message', aiPayload);
          socket.emit('message', aiPayload);
        }

        // continue to also forward original message below
      }
    }

    /* 👥 GROUP CHAT */
    if (data.chat.type === 'group') {
      this.server.to(data.chat.name).emit('message', payload);
    }

    /* 👤 DIRECT MESSAGE */
    if (data.chat.type === 'dm') {
      const targetUsername = data.chat.name;
      const targetSocketId = this.userSockets.get(targetUsername);

      if (targetSocketId) {
        const receiverPayload = {
          ...payload,
          chat: {
            ...data.chat,
            name: sender,
          },
        };

        // send to receiver
        this.server.to(targetSocketId).emit('message', receiverPayload);

        // send back to sender (so UI updates)
        socket.emit('message', payload);
      }
    }

    console.log('Message:', payload);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { user: string; chat: { type: string; name: string } },
    @ConnectedSocket() socket: Socket,
  ) {
    // Broadcast typing to room or to DM target
    if (data.chat?.type === 'group') {
      this.server.to(data.chat.name).emit('typing', { user: data.user });
    } else if (data.chat?.type === 'dm') {
      const targetSocketId = this.userSockets.get(data.chat.name);
      if (targetSocketId) this.server.to(targetSocketId).emit('typing', { user: data.user });
    }
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
    return Array.from(this.userSockets.keys());
  }
}