import { randomBytes } from 'crypto';
import Stellar from '@stellar/stellar-sdk';

export interface NonceRecord {
    nonce: string;
    address: string;
    createdAt: Date;
    expiresAt: Date;
}

export interface SignatureVerificationRequest {
    address: string;
    signature: string;
    message: string;
}

export interface SignatureVerificationResult { 
    valid: boolean;
    address?: string;
    error?: string;
}

const nonceStore = new Map<string, NonceRecord>();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const NONCE_TTL = 5 * 60 * 1000;

setInterval(() => {
    const now = new Date();
    for (const [key, record] of nonceStore.entries()) {
        if (record.expiresAt < now) {
            nonceStore.delete(key);
        }
    }
}, CLEANUP_INTERVAL);

export function generateNonce(): string {
    return randomBytes(16).toString('hex');
}

export function storeNonce(address: string, nonce: string): NonceRecord {
    const now = new Date();
    const record: NonceRecord = {
        nonce,
        address,
        createdAt: now,
        expiresAt: new Date(now.getTime() + NONCE_TTL),
    };
    nonceStore.set(nonce, record);
    return record;
}

export function getNonceRecord(nonce: string): NonceRecord | undefined {
    const record = nonceStore.get(nonce);
    if (!record) return undefined;
    if (record.expiresAt < new Date()) {
        nonceStore.delete(nonce);
        return undefined;
    }
    return record;
}

export function consumeNonce(nonce: string): boolean {
    const record = getNonceRecord(nonce);
    if (record) {
        nonceStore.delete(nonce);
        return true;
    }
    return false;
}

export function verifyStellarSignature(
    address: string,
    signature: string,
    message: string
): SignatureVerificationResult {
    try {
        if (!address || !signature || !message) {
            return { valid: false, error: 'Missing required fields' };
        }
        const isValid = Stellar.verifySignature(address, signature, message);
        if (!isValid) return { valid: false, error: 'Invalid signature' };
        return { valid: true, address };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export function verifySignatureWithNonce(request: SignatureVerificationRequest): SignatureVerificationResult {
    const { address, signature, message } = request;
    let nonce: string;

    if (message.startsWith('[CommitLabs Auth V2]')) {
        const domainMatch = message.match(/Domain: ([^\n]+)/);
        const nonceMatch = message.match(/Nonce: ([a-f0-9]+)/);
        const expiresMatch = message.match(/ExpiresAt: ([^\n]+)/);

        if (!nonceMatch || !expiresMatch || !domainMatch) {
            return { valid: false, error: 'Invalid V2 message format' };
        }
        if (domainMatch[1].trim() !== 'commitlabs.org') {
            return { valid: false, error: 'Domain mismatch' };
        }
        if (new Date() > new Date(expiresMatch[1].trim())) {
            return { valid: false, error: 'Challenge message expired' };
        }
        nonce = nonceMatch[1];
    } else {
        const nonceMatch = message.match(/Sign in to CommitLabs:\s*([a-f0-9]+)/i);
        if (!nonceMatch) return { valid: false, error: 'Invalid message format' };
        nonce = nonceMatch[1];
    }

    const nonceRecord = getNonceRecord(nonce);
    if (!nonceRecord) return { valid: false, error: 'Invalid or expired nonce' };
    if (nonceRecord.address !== address) return { valid: false, error: 'Nonce address mismatch' };

    const verificationResult = verifyStellarSignature(address, signature, message);
    if (verificationResult.valid) consumeNonce(nonce);
    return verificationResult;
}

export function generateChallengeMessage(nonce: string, domain: string = 'commitlabs.org'): string {
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return `[CommitLabs Auth V2]\nDomain: ${domain}\nNonce: ${nonce}\nIssuedAt: ${issuedAt}\nExpiresAt: ${expiresAt}`;
}

export function createSessionToken(address: string): string {
    return `session_${address}_${Date.now()}`;
}

export function verifySessionToken(token: string): { valid: boolean; address?: string } {
    return { valid: false };
}
