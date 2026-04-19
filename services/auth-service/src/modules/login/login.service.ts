import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class LoginService {
  private readonly databaseUrl = process.env.DATABASE_URL || '';
  private pool: Pool | null = null;
  private schemaPromise: Promise<unknown> | null = null;

  constructor(
    private readonly jwtService: JwtService,
  ) {}

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

  async login(loginDto: LoginDto) {
    let user = { username: loginDto.username, userId: 1 };

    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const usernameKey = String(loginDto.username || '').trim().toLowerCase();
      const result = await pool!.query('SELECT id, username, password_hash FROM app_users WHERE username_key = $1 LIMIT 1', [usernameKey]);
      const row = result.rows[0];
      if (row) {
        user = { username: row.username, userId: row.id };
      }
    }
    
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}