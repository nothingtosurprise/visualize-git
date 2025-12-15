import { StreamConfig } from 'motia'
import { z } from 'zod'

// Schema for repository star data - inspired by MotiaDev/github-stars-counter
export const repositoryStarsSchema = z.object({
  id: z.string(),
  stars: z.number(),
  name: z.string(),
  fullName: z.string(),
  owner: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  lastUpdated: z.string(),
  history: z.array(z.object({
    date: z.string(),
    stars: z.number(),
  })).optional(),
})

export type RepositoryStars = z.infer<typeof repositoryStarsSchema>

export const config: StreamConfig = {
  name: 'stars',
  schema: repositoryStarsSchema,
  baseConfig: { storageType: 'default' },
}

