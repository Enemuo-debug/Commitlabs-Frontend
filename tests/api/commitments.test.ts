import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '@/app/api/commitments/route'
import { createMockRequest, createMockRouteContext, parseResponse } from './helpers'

vi.mock('@/lib/backend/rateLimit', () => {
  return {
    checkRateLimit: vi.fn(async () => true),
  }
})

vi.mock('@/lib/backend/services/contracts', () => {
  let commitmentCounter = 0
  return {
    getUserCommitmentsFromChain: vi.fn(async () => {
      return [
        {
          id: 1,
          ownerAddress: 'GOWNER',
          asset: 'XLM',
          amount: '100',
          status: 'active',
          complianceScore: 100,
          currentValue: '100',
          feeEarned: '0',
          violationCount: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          expiresAt: '2024-01-02T00:00:00.000Z',
        },
      ]
    }),
    createCommitmentOnChain: vi.fn(async () => {
      commitmentCounter += 1
      return {
        commitmentId: String(commitmentCounter),
        ownerAddress: 'GOWNER',
        asset: 'XLM',
        amount: '100',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
      }
    }),
  }
})

describe('GET /api/commitments', () => {
  it('should return a list of commitments with default parameters', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments?ownerAddress=GOWNER'
    )
    const response = await GET(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('success', true)
    expect(result.data).toHaveProperty('data')
    expect(result.data.data).toHaveProperty('items')
    expect(result.data.data).toHaveProperty('page')
    expect(result.data.data).toHaveProperty('pageSize')
    expect(result.data.data).toHaveProperty('total')
    expect(Array.isArray(result.data.data.items)).toBe(true)
  })

  it('should return commitments filtered by status', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments?ownerAddress=GOWNER&status=active'
    )
    const response = await GET(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(200)
    expect(result.data.data.items).toBeInstanceOf(Array)
    result.data.data.items.forEach((commitment: any) => {
      expect(commitment.status).toBe('active')
    })
  })

  it('should support pagination with limit and offset', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments?ownerAddress=GOWNER&page=1&pageSize=5'
    )
    const response = await GET(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(200)
    expect(result.data.data.page).toBe(1)
    expect(result.data.data.pageSize).toBe(5)
    expect(result.data.data.items.length).toBeLessThanOrEqual(5)
  })

  it('should return commitment objects with required fields', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments?ownerAddress=GOWNER'
    )
    const response = await GET(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.data.data.items.length).toBeGreaterThan(0)

    result.data.data.items.forEach((commitment: any) => {
      expect(commitment).toHaveProperty('commitmentId')
      expect(commitment).toHaveProperty('ownerAddress')
      expect(commitment).toHaveProperty('asset')
      expect(commitment).toHaveProperty('amount')
      expect(commitment).toHaveProperty('status')
      expect(commitment).toHaveProperty('createdAt')
    })
  })

  it('should include x-request-id response header (generated)', async () => {
    const request = createMockRequest('http://localhost:3000/api/commitments?ownerAddress=GOWNER')
    const response = await GET(request, createMockRouteContext())
    const result = await parseResponse(response)

    const requestId = result.headers.get('x-request-id')
    expect(typeof requestId).toBe('string')
    expect(requestId?.length).toBeGreaterThan(0)
  })

  it('should preserve x-request-id when provided by client', async () => {
    const incomingRequestId = 'test-request-id-abc'
    const request = createMockRequest('http://localhost:3000/api/commitments?ownerAddress=GOWNER', {
      headers: {
        'x-request-id': incomingRequestId,
      },
    })
    const response = await GET(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.headers.get('x-request-id')).toBe(incomingRequestId)
  })
})

describe('POST /api/commitments', () => {
  it('should create a new commitment with valid data', async () => {
    const commitmentData = {
      ownerAddress: 'GOWNER',
      asset: 'XLM',
      amount: '100',
      durationDays: 1,
      maxLossBps: 0,
    }

    const request = createMockRequest(
      'http://localhost:3000/api/commitments',
      {
        method: 'POST',
        body: commitmentData,
      }
    )

    const response = await POST(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(201)
    expect(result.data).toHaveProperty('success', true)
    expect(result.data.data).toHaveProperty('commitmentId')
  })

  it('should return 400 if required fields are missing', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments',
      {
        method: 'POST',
        body: { title: 'Incomplete Commitment' },
      }
    )

    const response = await POST(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(400)
  })

  it('should return 400 if title is missing', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments',
      {
        method: 'POST',
        body: { amount: 5000 },
      }
    )

    const response = await POST(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(400)
  })

  it('should return 400 if amount is missing', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/commitments',
      {
        method: 'POST',
        body: { title: 'No Amount' },
      }
    )

    const response = await POST(request, createMockRouteContext())
    const result = await parseResponse(response)

    expect(result.status).toBe(400)
  })

  it('should generate a unique ID for each commitment', async () => {
    const commitmentData = {
      ownerAddress: 'GOWNER',
      asset: 'XLM',
      amount: '100',
      durationDays: 1,
      maxLossBps: 0,
    }

    const request1 = createMockRequest(
      'http://localhost:3000/api/commitments',
      {
        method: 'POST',
        body: commitmentData,
      }
    )

    const request2 = createMockRequest(
      'http://localhost:3000/api/commitments',
      {
        method: 'POST',
        body: commitmentData,
      }
    )

    const response1 = await POST(request1, createMockRouteContext())
    const response2 = await POST(request2, createMockRouteContext())

    const result1 = await parseResponse(response1)
    const result2 = await parseResponse(response2)

    // IDs should be different
    expect(result1.data.data.commitmentId).not.toBe(result2.data.data.commitmentId)
  })

  it('should include x-request-id response header', async () => {
    const request = createMockRequest('http://localhost:3000/api/commitments', {
      method: 'POST',
      body: {
        ownerAddress: 'GOWNER',
        asset: 'XLM',
        amount: '100',
        durationDays: 1,
        maxLossBps: 0,
      },
    })

    const response = await POST(request, createMockRouteContext())
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })
})
