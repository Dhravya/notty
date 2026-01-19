import { z } from "zod";

export const searchResultSchema = z.object({
  content: z.string(),
  noteId: z.string().optional(),
  score: z.number().optional(),
});

export const searchResponseSchema = z.object({
  answer: z.string(),
  results: z.array(searchResultSchema),
});

export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
