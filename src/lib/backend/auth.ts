import { randomBytes } from 'crypto';
import Stellar from '@stellar/stellar-sdk';
import { getKV } from './kv';

// ─── Types ────────────────────────────────────────────────────────────────

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

// ─── Configuration ──────────────────────────────────────────────────────────

const NONCE_TTL_SECONDS = 5 * 60; // 5 minutes

// ─── Nonce Management ───────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random nonce.
 */
export function generateNonce(): string {
    return randomBytes(16).toString('hex');
}

/**
 * Store a nonce for a given Stellar address in KV store with TTL.
 */
export async function storeNonce(address: string, nonce: string): Promise<NonceRecord> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + NONCE_TTL_SECONDS * 1000);
    
    const record: NonceRecord = {
        nonce,
        address,
        createdAt: now,
        expiresAt,
    };
    
    const kv = getKV();
    const redisKey = `auth:nonce:${nonce}`;
    
    await kv.set(redisKey, record, NONCE_TTL_SECONDS);
    
    return record;
}

/**
 * Retrieve a nonce record by nonce value.
 */
export async function getNonceRecord(nonce: string): Promise<NonceRecord | null> {
    const kv = getKV();
    const redisKey = `auth:nonce:${nonce}`;
    return await kv.get<NonceRecord>(redisKey);
}

/**
 * Consume/remove a nonce after successful verification (Atomic).
 * Uses GETDEL if supported by the KV store.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
    const kv = getKV();
    const redisKey = `auth:nonce:${nonce}`;
    const record = await kv.getdel<NonceRecord>(redisKey);
    return !!record;
}

// ─── Signature Verification ─────────────────────────────────────────────────

/**
 * Verify a Stellar signature against a message and address.
 * 
 * Uses the Stellar SDK to verify that the signature was created by the
 * private key corresponding to the provided public address.
 */
export function verifyStellarSignature(
    address: string,
    signature: string,
    message: string
): SignatureVerificationResult {
    try {
        // Validate inputs
        if (!address || !signature || !message) {
            return {
                valid: false,
                error: 'Missing required fields: address, signature, or message',
            };
        }

        // Verify the signature using Stellar SDK
        const isValid = Stellar.verifySignature(address, signature, message);
        
        if (!isValid) {
            return {
                valid: false,
                error: 'Invalid signature',
            };
        }

        return {
            valid: true,
            address,
        };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Unknown verification error',
        };
    }
}

/**
 * Verify a signature request including nonce validation.
 */
export async function verifySignatureWithNonce(request: SignatureVerificationRequest): Promise<SignatureVerificationResult> {
    const { address, signature, message } = request;
    
    // Extract nonce from message (expected format: "Sign in to CommitLabs: {nonce}")
    const nonceMatch = message.match(/Sign in to CommitLabs:\s*([a-f0-9]+)/i);
    if (!nonceMatch) {
        return {
            valid: false,
            error: 'Invalid message format. Expected: "Sign in to CommitLabs: {nonce}"',
        };
    }
    
    const nonce = nonceMatch[1];
    const nonceRecord = await getNonceRecord(nonce);
    
    if (!nonceRecord) {
        return {
            valid: false,
            error: 'Invalid or expired nonce',
        };
    }
    
    if (nonceRecord.address !== address) {
        return {
            valid: false,
            error: 'Nonce address mismatch',
        };
    }
    
    // Verify the signature
    const verificationResult = verifyStellarSignature(address, signature, message);
    
    // If signature is valid, consume the nonce (atomic)
    if (verificationResult.valid) {
        const consumed = await consumeNonce(nonce);
        if (!consumed) {
            return {
                valid: false,
                error: 'Nonce already consumed or expired during verification',
            };
        }
    }
    
    return verificationResult;
}

// ─── Challenge Message Generation ─────────────────────────────────────────────

/**
 * Generate a challenge message for the user to sign.
 */
export function generateChallengeMessage(nonce: string): string {
    return `Sign in to CommitLabs: ${nonce}`;
}

// ─── Session Management (TODO) ─────────────────────────────────────────────────

/**
 * TODO: Create a session token after successful verification.
 * This should return a JWT or similar session identifier.
 */
export function createSessionToken(address: string): string {
    // TODO: Implement JWT creation or session management
    // For now, return a placeholder
    return `session_${address}_${Date.now()}`;
}

/**
 * TODO: Verify a session token.
 */
export function verifySessionToken(token: string): { valid: boolean; address?: string } {
    // Basic implementation for the placeholder token format: session_{address}_{timestamp}
    if (token && token.startsWith('session_')) {
        const parts = token.split('_');
        if (parts.length >= 2) {
            return { valid: true, address: parts[1] };
        }
    }
    return { valid: false };
}
