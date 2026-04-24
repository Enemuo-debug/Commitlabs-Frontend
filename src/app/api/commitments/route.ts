import { NextRequest } from 'next/server'
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { withApiHandler } from "@/lib/backend/withApiHandler";
import { ok, fail } from "@/lib/backend/apiResponse";
import { TooManyRequestsError } from "@/lib/backend/errors";
import { getUserCommitmentsFromChain, createCommitmentOnChain } from "@/lib/backend/services/contracts";

interface CreateCommitmentRequestBody {
  ownerAddress: string;
  asset: string;
  amount: string;
  durationDays: number;
  maxLossBps: number;
  metadata?: Record<string, unknown>;
}


export const GET = withApiHandler(async (req: NextRequest, context: { params: Record<string, string> }, correlationId: string) => {
  const { searchParams } = new URL(req.url);

  const ownerAddress = searchParams.get("ownerAddress");
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Number(searchParams.get("pageSize") ?? 10);

  if (!ownerAddress) {
    return fail("Missing ownerAddress", "BAD_REQUEST", 400, correlationId);
  }

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    return fail("Invalid pagination params", "BAD_REQUEST", 400, correlationId);
  }

  const ip = req.ip ?? req.headers.get("x-forwarded-for") ?? "anonymous";

  const isAllowed = await checkRateLimit(ip, "api/commitments");
  if (!isAllowed) {
    throw new TooManyRequestsError();
  }

  const commitments = await getUserCommitmentsFromChain(ownerAddress);

  const mapped = commitments.map((c) => ({
    commitmentId: String(c.id),
    ownerAddress:  c.ownerAddress,
    asset: c.asset,
    amount: typeof c.amount === "bigint" ? String(c.amount) : c.amount,
    status: c.status,
    complianceScore: c.complianceScore,
    currentValue:
      typeof c.currentValue === "bigint"
        ? c.currentValue
        : c.currentValue,
    feeEarned: c.feeEarned,
    violationCount: c.violationCount,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
  }));

  const start = (page - 1) * pageSize;
  const items = mapped.slice(start, start + pageSize);

  return ok({
    items,
    page,
    pageSize,
    total: mapped.length, // TODO: optimize if chain indexing improves
  }, undefined, 200, correlationId);
});

export const POST = withApiHandler(async (req: NextRequest, context: { params: Record<string, string> }, correlationId: string) => {
  const ip = req.ip ?? req.headers.get("x-forwarded-for") ?? "anonymous";

  const isAllowed = await checkRateLimit(ip, "api/commitments");
  if (!isAllowed) {
    throw new TooManyRequestsError();
  }

  const body = (await req.json()) as CreateCommitmentRequestBody;

  const {
    ownerAddress,
    asset,
    amount,
    durationDays,
    maxLossBps,
    metadata,
  } = body;

  // Basic validation
  if (!ownerAddress || typeof ownerAddress !== "string") {
    return fail("BAD_REQUEST", "Invalid ownerAddress", undefined, 400, correlationId);
  }

  if (!asset || typeof asset !== "string") {
    return fail("BAD_REQUEST", "Invalid asset", undefined, 400, correlationId);
  }

  if (!amount || isNaN(Number(amount))) {
    return fail("BAD_REQUEST", "Invalid amount", undefined, 400, correlationId);
  }

  if (!durationDays || durationDays <= 0) {
    return fail("BAD_REQUEST", "Invalid durationDays", undefined, 400, correlationId);
  }

  if (maxLossBps == null || maxLossBps < 0) {
    return fail("BAD_REQUEST", "Invalid maxLossBps", undefined, 400, correlationId);
  }

  // Call chain interaction
  const result = await createCommitmentOnChain({
    ownerAddress,
    asset,
    amount,
    durationDays,
    maxLossBps,
    metadata,
  });

  return ok(result, undefined, 201, correlationId);
});
