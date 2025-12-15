import { StreamConfig } from 'motia'
import { z } from 'zod'

export const repoUpdateSchema = z.object({
  id: z.string(),
  owner: z.string(),
  repo: z.string(),
  type: z.enum(['commit', 'push', 'branch', 'refresh']),
  message: z.string(),
  author: z.string().optional(),
  sha: z.string().optional(),
  timestamp: z.string(),
  nodeCount: z.number().optional(),
  linkCount: z.number().optional(),
})

export type RepoUpdate = z.infer<typeof repoUpdateSchema>

export const config: StreamConfig = {
  name: 'repoUpdates',
  schema: repoUpdateSchema,
  baseConfig: { storageType: 'default' },
}

