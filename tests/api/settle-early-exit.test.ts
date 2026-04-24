import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/commitments/[id]/settle/route'
import { POST as EarlyExitPOST } from '@/app/api/commitments/[id]/early-exit/route'
import { createMockRequest, parseResponse } from './helpers'

// Mock the dependencies
vi.mock('@/lib/backend/rateLimit', () => ({
  checkRateLimit: vi.fn()
}))

vi.mock('@/lib/backend/services/contracts', () => ({
  settleCommitmentOnChain: vi.fn()
}))

vi.mock('@/lib/backend/logger', () => ({
  logCommitmentSettled: vi.fn(),
  logEarlyExit: vi.fn()
}))

vi.mock('@/lib/backend/withApiHandler', () => ({
  withApiHandler: (handler: any) => handler
}))

vi.mock('@/lib/backend/apiResponse', () => ({
  ok: (data: any) => {
    const response = new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    return response
  }
}))

vi.mock('@/lib/backend/errors', () => ({
  TooManyRequestsError: class extends Error {
    constructor() {
      super('Too many requests')
      this.name = 'TooManyRequestsError'
    }
  },
  ValidationError: class extends Error {
    constructor(message: string, details?: any) {
      super(message)
      this.name = 'ValidationError'
    }
  },
  NotFoundError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NotFoundError'
    }
  },
  ConflictError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ConflictError'
    }
  }
}))

import { checkRateLimit } from '@/lib/backend/rateLimit'
import { settleCommitmentOnChain } from '@/lib/backend/services/contracts'
import { logCommitmentSettled, logEarlyExit } from '@/lib/backend/logger'
import { ValidationError, NotFoundError, ConflictError } from '@/lib/backend/errors'

describe('POST /api/commitments/[id]/settle - Error States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue(true)
  })

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue(false)
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(429)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'TOO_MANY_REQUESTS')
    })
  })

  describe('Request Validation', () => {
    it('should return 400 when commitment ID is missing', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments//settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: '' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect(result.data.error.message).toContain('Commitment ID is required')
    })

    it('should return 400 when request body contains invalid JSON', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { 
          method: 'POST',
          body: 'invalid json{',
          headers: { 'Content-Type': 'application/json' }
        }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect(result.data.error.message).toContain('Invalid JSON')
    })

    it('should return 400 when request body is missing', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: null }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect(result.data.error.message).toContain('Invalid JSON')
    })

    it('should return 400 when callerAddress is invalid', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { 
          method: 'POST', 
          body: { callerAddress: 123 } // Should be string
        }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'VALIDATION_ERROR')
    })
  })

  describe('Contract Service Errors', () => {
    it('should return 404 when commitment is not found', async () => {
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(
        new NotFoundError('Commitment not found')
      )
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/nonexistent-id/settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: 'nonexistent-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(404)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'NOT_FOUND')
      expect(result.data.error.message).toContain('Commitment not found')
    })

    it('should return 409 when commitment is already settled', async () => {
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(
        new ConflictError('Commitment has already been settled')
      )
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/settled-id/settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: 'settled-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(409)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'CONFLICT')
      expect(result.data.error.message).toContain('already been settled')
    })

    it('should return 400 when commitment is not matured', async () => {
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(
        new ValidationError('Commitment has not matured yet and cannot be settled')
      )
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/immature-id/settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: 'immature-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect(result.data.error.message).toContain('not matured')
    })

    it('should return 500 for upstream service failures', async () => {
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(
        new Error('Upstream service unavailable')
      )
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(500)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error).toHaveProperty('code', 'INTERNAL_ERROR')
    })

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout')
      timeoutError.name = 'TimeoutError'
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(timeoutError)
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: {} }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(500)
      expect(result.data).toHaveProperty('ok', false)
    })
  })

  describe('Authorization Errors', () => {
    it('should handle forbidden actor scenarios', async () => {
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(
        new ValidationError('Not authorized to settle this commitment')
      )
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: { callerAddress: 'unauthorized-address' } }
      )
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect(result.data.error.message).toContain('authorized')
    })
  })

  describe('Logging', () => {
    it('should log successful settlement attempts', async () => {
      vi.mocked(settleCommitmentOnChain).mockResolvedValue({
        settlementAmount: '1000.50',
        finalStatus: 'SETTLED',
        txHash: 'abc123',
        reference: 'CHAIN_CALL_SETTLE_COMMITMENT'
      })
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: { callerAddress: 'test-address' } }
      )
      
      await POST(request, { params: { id: 'test-id' } })
      
      expect(logCommitmentSettled).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id',
        callerAddress: 'test-address',
        settlementAmount: '1000.50',
        finalStatus: 'SETTLED',
        txHash: 'abc123'
      })
    })

    it('should log failed settlement attempts', async () => {
      vi.mocked(settleCommitmentOnChain).mockRejectedValue(
        new Error('Settlement failed')
      )
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/settle',
        { method: 'POST', body: { callerAddress: 'test-address' } }
      )
      
      await POST(request, { params: { id: 'test-id' } })
      
      expect(logCommitmentSettled).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id',
        callerAddress: 'test-address',
        error: 'Settlement failed'
      })
    })
  })
})

describe('POST /api/commitments/[id]/early-exit - Error States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue(true)
  })

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue(false)
      
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/early-exit',
        { method: 'POST', body: {} }
      )
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(429)
      expect(result.data).toHaveProperty('error', 'Too many requests')
    })
  })

  describe('Request Validation', () => {
    it('should handle invalid JSON gracefully', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/early-exit',
        { 
          method: 'POST',
          body: 'invalid json{',
          headers: { 'Content-Type': 'application/json' }
        }
      )
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200) // Current implementation returns 200 even with invalid JSON
      expect(logEarlyExit).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id',
        error: 'failed to parse request body'
      })
    })

    it('should handle missing request body gracefully', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/early-exit',
        { method: 'POST', body: null }
      )
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200)
      expect(logEarlyExit).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id',
        error: 'failed to parse request body'
      })
    })
  })

  describe('Logging', () => {
    it('should log early exit attempts with valid body', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/early-exit',
        { method: 'POST', body: { reason: 'user requested', penalty: 100 } }
      )
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200)
      expect(logEarlyExit).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id',
        reason: 'user requested',
        penalty: 100
      })
    })

    it('should log early exit attempts with empty body', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/early-exit',
        { method: 'POST', body: {} }
      )
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200)
      expect(logEarlyExit).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id'
      })
    })
  })

  describe('Response Format', () => {
    it('should return stub response with correct format', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/commitments/test-id/early-exit',
        { method: 'POST', body: {} }
      )
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200)
      expect(result.data).toHaveProperty('message')
      expect(result.data).toHaveProperty('commitmentId', 'test-id')
      expect(result.data.message).toContain('Stub early-exit endpoint')
    })
  })
})
