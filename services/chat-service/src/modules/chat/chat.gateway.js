"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
let ChatGateway = class ChatGateway {
    constructor() {
        /* 🔥 Better Data Structure */
        this.users = new Map(); // socketId -> username
        this.userSockets = new Map(); // username -> socketId
    }
    /* 🟢 CONNECT */
    handleConnection(socket) {
        console.log('User connected:', socket.id);
    }
    /* 🔴 DISCONNECT */
    handleDisconnect(socket) {
        const username = this.users.get(socket.id);
        if (username) {
            this.users.delete(socket.id);
            this.userSockets.delete(username);
            this.server.emit('online_users', this.getOnlineUsers());
            console.log(`${username} disconnected`);
        }
    }
    /* 👤 JOIN USER */
    handleJoin(data, socket) {
        const { username } = data;
        socket.data.username = username;
        this.users.set(socket.id, username);
        this.userSockets.set(username, socket.id);
        /* Auto join default room */
        socket.join('general');
        this.server.emit('online_users', this.getOnlineUsers());
        console.log(`${username} joined`);
    }
    /* 🏠 JOIN ROOM */
    handleJoinRoom(data, socket) {
        socket.join(data.room);
        console.log(`${socket.data.username} joined room ${data.room}`);
    }
    /* 💬 MESSAGE HANDLER */
    handleMessage(data, socket) {
        const sender = this.users.get(socket.id);
        if (!sender)
            return;
        const payload = {
            ...data,
            user: sender,
        };
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
                }
                else {
                    // DM - reply to both
                    const targetSocketId = this.userSockets.get(data.chat.name);
                    if (targetSocketId)
                        this.server.to(targetSocketId).emit('message', aiPayload);
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
                // send to receiver
                this.server.to(targetSocketId).emit('message', payload);
                // send back to sender (so UI updates)
                socket.emit('message', payload);
            }
        }
        console.log('Message:', payload);
    }
    handleTyping(data, socket) {
        // Broadcast typing to room or to DM target
        if (data.chat?.type === 'group') {
            this.server.to(data.chat.name).emit('typing', { user: data.user });
        }
        else if (data.chat?.type === 'dm') {
            const targetSocketId = this.userSockets.get(data.chat.name);
            if (targetSocketId)
                this.server.to(targetSocketId).emit('typing', { user: data.user });
        }
    }
    /* 🔎 Simple local AI command handler (open-source/mock) */
    handleAICommand(commandText, sender) {
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
            if (!parts)
                return 'Please provide text after /summarize to summarize.';
            return parts.split(/[\.\!\?]\s/)[0] + '...';
        }
        if (lower.startsWith('/explain')) {
            const topic = commandText.replace('/explain', '').trim() || 'that topic';
            return `Here's a brief explanation of ${topic}: This is a concise, developer-friendly explanation (mock).`;
        }
        if (lower.startsWith('@ai')) {
            const prompt = commandText.replace('@ai', '').trim();
            if (!prompt)
                return 'Hello! Ask me something like: @ai what is event loop?';
            return `AI mock answer to: "${prompt}" — (this is a local open-source mock response).`;
        }
        return 'AI: command not recognized.';
    }
    /* 🧠 UTIL */
    getOnlineUsers() {
        return Array.from(this.userSockets.keys());
    }
};
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_room'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleJoinRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('message'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('typing'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleTyping", null);
ChatGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    })
], ChatGateway);
exports.ChatGateway = ChatGateway;
