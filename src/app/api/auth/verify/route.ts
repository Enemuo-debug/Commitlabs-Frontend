import { NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/backend/rateLimit';
import { withApiHandler } from '@/lib/backend/withApiHandler';
import { ok } from '@/lib/backend/apiResponse';
import { TooManyRequestsError, ValidationError, UnauthorizedError } from '@/lib/backend/errors';
import { verifySignatureWithNonce, createSessionToken } from '@/lib/backend/auth';

// Request validation schema
const VerifyRequestSchema = z.object({
    address: z.string().min(1, 'Address is required'),
    signature: z.string().min(1, 'Signature is required'),
    message: z.string().min(1, 'Message is required'),
});

export const POST = withApiHandler(async (req: NextRequest, context: { params: Record<string, string> }, correlationId: string) => {
    const ip = req.ip ?? req.headers.get('x-forwarded-for') ?? 'anonymous';

    // Rate limiting
    const isAllowed = await checkRateLimit(ip, 'api/auth/verify');
    if (!isAllowed) {
        throw new TooManyRequestsError();
    }

    // Parse and validate request body
    let body;
    try {
        body = await req.json();
    } catch (error) {
        throw new ValidationError('Invalid JSON in request body');
    }

    const validation = VerifyRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ValidationError('Invalid request data', validation.error.errors);
    }

    const { address, signature, message } = validation.data;

    // Verify the signature and nonce
    const verificationResult = verifySignatureWithNonce({
        address,
        signature,
        message,
    });

    if (!verificationResult.valid) {
        throw new UnauthorizedError(verificationResult.error || 'Signature verification failed');
    }

    // Create JWT session token with CSRF token
    const sessionResult = createSessionToken(address);

    // Return unified response with session cookie
    const response = ok({
        verified: true,
        address: verificationResult.address,
        message: 'Signature verified successfully',
        csrfToken: sessionResult.csrfToken, // Send CSRF token for client to use in subsequent requests
    }, undefined, 200, correlationId);

    // Set secure HTTP-only session cookie
    response.cookies.set('session', sessionResult.token, {
        httpOnly: true, // Prevent JavaScript access
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict', // Prevent CSRF
        maxAge: 24 * 60 * 60, // 24 hours in seconds
        path: '/', // Available site-wide
    });

    // Set non-HttpOnly CSRF cookie for client-side access (double-submit pattern)
    response.cookies.set('csrf', sessionResult.csrfToken, {
        httpOnly: false, // Allow JavaScript access for CSRF token
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict', // Prevent CSRF
        maxAge: 24 * 60 * 60, // 24 hours in seconds
        path: '/', // Available site-wide
    });

    return response;
});
