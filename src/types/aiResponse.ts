import { z } from "zod"

const searchResult =     z.array(
    z.tuple([
        z.string(),
        z.object({
          app_id: z.string(),
          data_type: z.string(),
          doc_id: z.string(),
          hash: z.string(),
          note_id: z.string(),
          url: z.string(),
          user: z.string(),
          score: z.number()
        })
      ]
    )
  )

export const aiResponse = z.tuple([
    z.string(),
    searchResult
])

export type AiResponse = z.infer<typeof aiResponse>
