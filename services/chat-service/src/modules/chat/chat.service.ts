import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatService {
    private messages: any[] = [];

    sendMessage(senderId: string, receiverId: string, message: string) {
        const chatMessage = {
            senderId,
            receiverId,
            message,
            timestamp: new Date(),
        };
        this.messages.push(chatMessage);
        return chatMessage;
    }

    getMessages() {
        return this.messages;
    }

    getMessagesForUser(userId: string) {
        return this.messages.filter(
            msg => msg.senderId === userId || msg.receiverId === userId
        );
    }
}