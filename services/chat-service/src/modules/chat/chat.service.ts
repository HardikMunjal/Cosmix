import { Injectable } from '@nestjs/common';

interface ChatMessage {
    senderId: string;
    receiverId: string;
    message: string;
    timestamp: Date;
}

@Injectable()
export class ChatService {
    private messagesByUser = new Map<string, ChatMessage[]>();
    private allMessages: ChatMessage[] = [];

    sendMessage(senderId: string, receiverId: string, message: string) {
        const chatMessage: ChatMessage = {
            senderId,
            receiverId,
            message,
            timestamp: new Date(),
        };

        // Index under both participants for O(1) per-user retrieval
        const addToUser = (userId: string) => {
            const list = this.messagesByUser.get(userId);
            if (list) {
                list.push(chatMessage);
            } else {
                this.messagesByUser.set(userId, [chatMessage]);
            }
        };

        addToUser(senderId);
        if (receiverId !== senderId) {
            addToUser(receiverId);
        }

        this.allMessages.push(chatMessage);
        return chatMessage;
    }

    getMessages(): ChatMessage[] {
        return this.allMessages;
    }

    getMessagesForUser(userId: string): ChatMessage[] {
        return this.messagesByUser.get(userId) ?? [];
    }
}