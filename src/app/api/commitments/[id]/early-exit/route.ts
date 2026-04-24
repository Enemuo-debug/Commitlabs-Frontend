import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/backend/rateLimit';
import { logEarlyExit } from '@/lib/backend/logger';
import { cache } from '@/lib/backend/cache/factory';
import { CacheKey } from '@/lib/backend/cache/index';

interface Params {
    params: { id: string };
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id } = params;

    const ip = req.ip || req.headers.get('x-forwarded-for') || 'anonymous';
    const isAllowed = await checkRateLimit(ip, 'api/commitments/early-exit');
    if (!isAllowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // TODO: perform early exit processing (penalty calculation, contract call, etc.)
    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
        logEarlyExit({ ip, commitmentId: id, ...body });
    } catch {
        logEarlyExit({ ip, commitmentId: id, error: 'failed to parse request body' });
    }

    // Invalidate caches for this commitment once the early-exit write is
    // implemented. Already wired here so the hook is in place when the TODO
    // above is completed.
    await cache.delete(CacheKey.commitment(id));
    // ownerAddress is unknown at this stub stage; invalidate by prefix when
    // the full implementation provides it.
    if (typeof body.ownerAddress === 'string' && body.ownerAddress) {
        await cache.delete(CacheKey.userCommitments(body.ownerAddress));
    }

    return NextResponse.json({
        message: `Stub early-exit endpoint for commitment ${id}`,
        commitmentId: id
    });
}
