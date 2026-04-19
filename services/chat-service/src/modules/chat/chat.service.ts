import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ChatService {
    private messages: any[] = [];
    private readonly databaseUrl = process.env.DATABASE_URL || '';
    private pool: Pool | null = null;
    private schemaPromise: Promise<unknown> | null = null;

    private hasDatabase() {
        return Boolean(this.databaseUrl);
    }

    private getPool() {
        if (!this.hasDatabase()) return null;
        if (!this.pool) {
            this.pool = new Pool({ connectionString: this.databaseUrl });
        }
        return this.pool;
    }

    private async ensureSchema() {
        if (!this.hasDatabase()) return null;
        if (!this.schemaPromise) {
            const pool = this.getPool();
            this.schemaPromise = pool?.query(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    chat_type TEXT NOT NULL,
                    chat_name TEXT NOT NULL,
                    sender_name TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_type, chat_name, created_at DESC);
            `);
        }
        await this.schemaPromise;
        return this.getPool();
    }

    async sendMessage(payload: any) {
        const chatMessage = {
            ...payload,
            id: payload.id || `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            timestamp: payload.timestamp || new Date().toISOString(),
        };

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool!.query(
                `INSERT INTO chat_messages (id, chat_type, chat_name, sender_name, payload, created_at)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
                [chatMessage.id, chatMessage.chat.type, chatMessage.chat.name, chatMessage.user, JSON.stringify(chatMessage), chatMessage.timestamp],
            );
            return chatMessage;
        }

        this.messages.push(chatMessage);
        return chatMessage;
    }

    async getMessages() {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool!.query('SELECT payload FROM chat_messages ORDER BY created_at DESC LIMIT 100');
            return result.rows.map((row) => row.payload).reverse();
        }

        return this.messages;
    }

    async getMessagesForUser(userId: string) {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool!.query(
                `SELECT payload FROM chat_messages
                 WHERE sender_name = $1 OR chat_name = $1
                 ORDER BY created_at DESC LIMIT 100`,
                [userId],
            );
            return result.rows.map((row) => row.payload).reverse();
        }

        return this.messages.filter(
            (msg) => msg.user === userId || msg.chat?.name === userId,
        );
    }

    async getMessagesForChat(chat: { type: 'group' | 'dm'; name: string }, username?: string) {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            if (chat.type === 'group') {
                const result = await pool!.query(
                    `SELECT payload FROM chat_messages
                     WHERE chat_type = 'group' AND chat_name = $1
                     ORDER BY created_at DESC LIMIT 50`,
                    [chat.name],
                );
                return result.rows.map((row) => row.payload).reverse();
            }

            const result = await pool!.query(
                `SELECT payload FROM chat_messages
                 WHERE chat_type = 'dm'
                   AND ((sender_name = $1 AND chat_name = $2) OR (sender_name = $2 AND chat_name = $1))
                 ORDER BY created_at DESC LIMIT 50`,
                [username || '', chat.name],
            );
            return result.rows.map((row) => row.payload).reverse();
        }

        if (chat.type === 'group') {
            return this.messages.filter((msg) => msg.chat?.type === 'group' && msg.chat?.name === chat.name);
        }

        return this.messages.filter((msg) => msg.chat?.type === 'dm' && ((msg.user === username && msg.chat?.name === chat.name) || (msg.user === chat.name && msg.chat?.name === username)));
    }
}