import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'wellness');

function sanitizeUserId(userId: string): string {
  return String(userId || 'default').replace(/[^a-zA-Z0-9_@.\-]/g, '_').slice(0, 120);
}

@Injectable()
export class WellnessStorageService {
  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private filePath(userId: string): string {
    return path.join(DATA_DIR, `${sanitizeUserId(userId)}.json`);
  }

  load(userId: string): { entries: any[]; form: any } {
    const file = this.filePath(userId);
    if (!fs.existsSync(file)) {
      return { entries: [], form: null };
    }
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const data = JSON.parse(raw);
      return {
        entries: Array.isArray(data.entries) ? data.entries : [],
        form: data.form || null,
      };
    } catch {
      return { entries: [], form: null };
    }
  }

  save(userId: string, payload: { entries: any[]; form: any }): void {
    const file = this.filePath(userId);
    const data = {
      entries: Array.isArray(payload.entries) ? payload.entries.slice(0, 120) : [],
      form: payload.form || null,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  }
}
