import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/commitments/[id]/settle/route'
import { POST as EarlyExitPOST } from '@/app/api/commitments/[id]/early-exit/route'
import { createMockRequest, parseResponse } from './helpers'

/**
 * Type definitions for better type safety in test mocks
 */
interface MockError extends Error {
  name: string
  constructor?: new (message?: string) => MockError
}

/**
 * Standard API response interface for type-safe assertions
 */
interface ApiResponse {
  ok: boolean
  data?: unknown
  error?: {
    code: string
    message: string
  }
}

/**
 * Test parameters interface for API route handlers
 */
interface TestParams {
  params: { id: string }
}

// Mock dependencies with proper typing
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

// Enhanced withApiHandler mock with proper error handling
vi.mock('@/lib/backend/withApiHandler', () => ({
  withApiHandler: (handler: (req: Request, params: TestParams) => Promise<Response>) => 
    async (req: Request, params: TestParams): Promise<Response> => {
      try {
        return await handler(req, params)
      } catch (error: unknown) {
        const typedError = error as MockError
        
        // Type-safe error handling
        const errorHandlers = {
          TooManyRequestsError: () => new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: 'TOO_MANY_REQUESTS',
                message: typedError.message || 'Too many requests'
              }
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          ),
          ValidationError: () => new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: typedError.message || 'Validation error'
              }
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          ),
          NotFoundError: () => new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: 'NOT_FOUND',
                message: typedError.message || 'Not found'
              }
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          ),
          ConflictError: () => new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: 'CONFLICT',
                message: typedError.message || 'Conflict'
              }
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const handler = errorHandlers[typedError.name as keyof typeof errorHandlers]
        return handler ? handler() : new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error'
            }
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
}))

vi.mock('@/lib/backend/apiResponse', () => ({
  ok: (data: unknown) => {
    const response = new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    return response
  }
}))

// Proper error class definitions with typing
vi.mock('@/lib/backend/errors', () => ({
  TooManyRequestsError: class extends Error {
    constructor(message = 'Too many requests') {
      super(message)
      this.name = 'TooManyRequestsError'
    }
  },
  ValidationError: class extends Error {
    constructor(message: string, details?: unknown) {
      super(message)
      this.name = 'ValidationError'
    }
  },
  NotFoundError: class extends Error {
    constructor(message = 'Not found') {
      super(message)
      this.name = 'NotFoundError'
    }
  },
  ConflictError: class extends Error {
    constructor(message = 'Conflict') {
      super(message)
      this.name = 'ConflictError'
    }
  }
}))

// Import mocked dependencies with proper typing
import { checkRateLimit } from '@/lib/backend/rateLimit'
import { settleCommitmentOnChain } from '@/lib/backend/services/contracts'
import { logCommitmentSettled, logEarlyExit } from '@/lib/backend/logger'
import { ValidationError, NotFoundError, ConflictError } from '@/lib/backend/errors'

/**
 * Test suite for settle endpoint error states
 */
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'TOO_MANY_REQUESTS')
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect((result.data as ApiResponse).error?.message).toContain('Commitment ID is required')
    })

    it('should return 400 when request body contains invalid JSON', async () => {
      // Create a mock request that will fail JSON parsing
      const request = new Request('http://localhost:3000/api/commitments/test-id/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      })
      
      const response = await POST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(400)
      expect(result.data).toHaveProperty('ok', false)
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect((result.data as ApiResponse).error?.message).toContain('Invalid JSON')
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'VALIDATION_ERROR')
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'NOT_FOUND')
      expect((result.data as ApiResponse).error?.message).toContain('Commitment not found')
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'CONFLICT')
      expect((result.data as ApiResponse).error?.message).toContain('already been settled')
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'VALIDATION_ERROR')
      expect((result.data as ApiResponse).error?.message).toContain('not matured')
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
      expect((result.data as ApiResponse).error).toHaveProperty('code', 'INTERNAL_ERROR')
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
      expect((result.data as ApiResponse).error?.message).toContain('authorized')
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

/**
 * Test suite for early exit endpoint error states
 */
describe('POST /api/commitments/[id]/early-exit - Error States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue(true)
  })

  describe('Request Validation', () => {
    it('should handle invalid JSON gracefully', async () => {
      const request = new Request('http://localhost:3000/api/commitments/test-id/early-exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      })
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200)
      expect(logEarlyExit).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        commitmentId: 'test-id',
        error: 'failed to parse request body'
      })
    })

    it('should handle missing request body gracefully', async () => {
      const request = new Request('http://localhost:3000/api/commitments/test-id/early-exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const response = await EarlyExitPOST(request, { params: { id: 'test-id' } })
      const result = await parseResponse(response)
      
      expect(result.status).toBe(200)
      expect(result.data).toHaveProperty('message')
      expect(result.data).toHaveProperty('commitmentId', 'test-id')
      expect((result.data as { message: string }).message).toContain('Stub early-exit endpoint')
    })
  })
})
