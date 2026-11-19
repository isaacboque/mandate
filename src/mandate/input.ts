import { z } from "zod";

/** Every amount in a mandate is at most 1,000,000.00: far inside the range where integer cents stay exact when added and multiplied. */
export const MAX_MANDATE_CENTS = 100_000_000;
const cents = z.number().int().nonnegative().max(MAX_MANDATE_CENTS);
export const MandateInput = z.object({
  currency: z.string().length(3).transform((s) => s.toUpperCase()),
  totalBudgetCents: cents.positive(),
  perItemCapCents: cents.positive(),
  allowedCategories: z.array(z.string().min(1)).min(1),
  allowedMerchants: z.array(z.string().min(1)).optional(),
  maxQuantityPerItem: z.number().int().min(1).max(100),
  expiresAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "expiresAt must be an ISO date"),
  autonomy: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("ask_always") }),
    z.object({ mode: z.literal("auto_under"), thresholdCents: cents.positive() }),
  ]),
});

