import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/backend/rateLimit';
import { getClientIp } from '@/lib/backend/getClientIp';
import { logEarlyExit } from '@/lib/backend/logger';

interface Params {
    params: { id: string };
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id } = params;

    const ip = getClientIp(req);
    const isAllowed = await checkRateLimit(ip, 'api/commitments/early-exit');
    if (!isAllowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // TODO: perform early exit processing (penalty calculation, contract call, etc.)
    try {
        const body = await req.json();
        logEarlyExit({ ip, commitmentId: id, ...body });
    } catch {
        logEarlyExit({ ip, commitmentId: id, error: 'failed to parse request body' });
    }

    return NextResponse.json({
        message: `Stub early-exit endpoint for commitment ${id}`,
        commitmentId: id
    });
}
