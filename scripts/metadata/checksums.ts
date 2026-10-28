import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STORE_METADATA_DIR } from './config';
import type { ChecksumData, MetadataContent } from './types';

export const CHECKSUMS_FILE_PATH = path.join(STORE_METADATA_DIR, '.checksums.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function computeReferenceHash(reference: MetadataContent): string {
  return crypto.createHash('sha256').update(`${reference.summary}\n---\n${reference.description}`).digest('hex');
}

export function loadChecksums(): ChecksumData {
  if (!fs.existsSync(CHECKSUMS_FILE_PATH)) {
    return {
      referenceHash: '',
      locales: {},
    };
  }

  try {
    const content = fs.readFileSync(CHECKSUMS_FILE_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return { referenceHash: '', locales: {} };
    }
    const referenceHash = typeof parsed.referenceHash === 'string' ? parsed.referenceHash : '';
    const locales: Record<string, string> = {};
    if (isRecord(parsed.locales)) {
      for (const [key, val] of Object.entries(parsed.locales)) {
        if (typeof val === 'string') {
          locales[key] = val;
        }
      }
    }
    return {
      referenceHash,
      locales,
    };
  } catch {
    return {
      referenceHash: '',
      locales: {},
    };
  }
}

export function saveChecksums(data: ChecksumData): void {
  fs.mkdirSync(STORE_METADATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKSUMS_FILE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
