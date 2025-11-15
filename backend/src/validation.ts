import { z } from 'zod'

export const KycSchema = z.object({
  wallet: z.string().min(1, 'wallet required'),
  status: z.string().min(1, 'status required'),
  provider: z.string().optional(),
  reference: z.string().optional(),
  payload: z.any().optional(),
})

export const DocSchema = z.object({
  uploader: z.string().optional(),
  hash: z.string().regex(/^[0-9a-fA-F]{64}$/u, 'hash must be 64-char hex (sha256)'),
  cid: z.string().optional(),
})

export const ScoreSchema = z.object({
  score: z.preprocess((v: unknown) => {
    if (typeof v === 'string') return Number(v)
    return v
  }, z.number()).refine((n: number) => Number.isFinite(n), 'score must be a number'),
  reason: z.string().optional(),
})

export const WebhookPaymentSchema = z.object({
  invoice_id: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
})

export const ListingCreateSchema = z.object({
  invoicePk: z.string().min(1),
  seller: z.string().min(1),
  price: z.string().min(1),
  qty: z.string().min(1),
  signature: z.string().optional(),
  ts: z.number().optional(),
})

export const ListingCancelSchema = z.object({
  signature: z.string().optional(),
  ts: z.number().optional(),
})

export const ListingFillSchema = z.object({
  qty: z.string().min(1),
  signature: z.string().optional(),
  ts: z.number().optional(),
})
