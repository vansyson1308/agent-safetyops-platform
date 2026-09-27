import { z } from 'zod';

// ?limit=&offset= for list endpoints. Lists return the newest items first
// and at most 500 per request.
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export function parsePagination(query: unknown) {
  const { limit, offset } = paginationSchema.parse(query);
  return { take: limit, skip: offset };
}
