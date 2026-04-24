import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/backend/withApiHandler';
import { ok, fail } from '@/lib/backend/apiResponse';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST = withApiHandler(async (req: NextRequest, context: { params: Record<string, string> }, correlationId: string) => {
    // Only allow this route in development mode
    if (process.env.NODE_ENV !== 'development') {
        return ok({ message: 'Not Found' }, undefined, 404, correlationId);
    }

    try {
        await execAsync('npm run seed:mock');
        return ok({ message: 'Mock data seeded successfully.' }, undefined, 200, correlationId);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('INTERNAL_ERROR', 'Failed to seed mock data', { error: msg }, 500, correlationId);
    }
});
