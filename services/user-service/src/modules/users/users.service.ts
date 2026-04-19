import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    private users: User[] = [];
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
                CREATE TABLE IF NOT EXISTS app_users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    username_key TEXT NOT NULL UNIQUE,
                    email TEXT,
                    email_key TEXT UNIQUE,
                    password_hash TEXT,
                    quote TEXT NOT NULL DEFAULT '',
                    avatar TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            `);
        }
        await this.schemaPromise;
        return this.getPool();
    }

    private mapUser(row: any): User {
        return {
            id: Number.parseInt(String(row.id).replace(/\D+/g, ''), 10) || Date.now(),
            username: row.username,
            email: row.email || '',
            createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        };
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const recordId = String(Date.now());
            const usernameKey = String(createUserDto.username || '').trim().toLowerCase();
            const emailKey = String(createUserDto.email || '').trim().toLowerCase() || null;
            const result = await pool!.query(
                `INSERT INTO app_users (id, username, username_key, email, email_key, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                 RETURNING *`,
                [recordId, createUserDto.username, usernameKey, createUserDto.email, emailKey],
            );
            return this.mapUser(result.rows[0]);
        }

        const newUser: User = { 
            id: this.users.length + 1, 
            username: createUserDto.username,
            email: createUserDto.email,
            createdAt: new Date()
        };
        this.users.push(newUser);
        return newUser;
    }

    async findAll(): Promise<User[]> {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool!.query('SELECT * FROM app_users ORDER BY created_at DESC');
            return result.rows.map((row) => this.mapUser(row));
        }

        return this.users;
    }

    async findOne(id: string): Promise<User | undefined> {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool!.query('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [String(id)]);
            return result.rows[0] ? this.mapUser(result.rows[0]) : undefined;
        }

        return this.users.find(user => user.id === parseInt(id));
    }

    async updateUser(id: number, updateData: any) {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool!.query(
                `UPDATE app_users
                 SET username = COALESCE($2, username),
                     username_key = COALESCE($3, username_key),
                     email = COALESCE($4, email),
                     email_key = COALESCE($5, email_key),
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [
                    String(id),
                    updateData.username ?? null,
                    updateData.username ? String(updateData.username).trim().toLowerCase() : null,
                    updateData.email ?? null,
                    updateData.email ? String(updateData.email).trim().toLowerCase() : null,
                ],
            );
            return result.rows[0] ? this.mapUser(result.rows[0]) : null;
        }

        const userIndex = this.users.findIndex(user => user.id === id);
        if (userIndex > -1) {
            this.users[userIndex] = { ...this.users[userIndex], ...updateData };
            return this.users[userIndex];
        }
        return null;
    }

    async deleteUser(id: number) {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool!.query('DELETE FROM app_users WHERE id = $1 RETURNING *', [String(id)]);
            return result.rows[0] ? this.mapUser(result.rows[0]) : null;
        }

        const userIndex = this.users.findIndex(user => user.id === id);
        if (userIndex > -1) {
            const deletedUser = this.users[userIndex];
            this.users.splice(userIndex, 1);
            return deletedUser;
        }
        return null;
    }
}