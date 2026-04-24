import { NextRequest, NextResponse } from 'next/server'
import { logInfo } from '@/lib/backend/logger'
import { attachSecurityHeaders } from '@/utils/response'
import pkg from '../../../../package.json'

export async function GET(req: NextRequest) {
  logInfo(req, 'Healthcheck requested')
  const response = NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: pkg.version,
  })
  return attachSecurityHeaders(response)
}
