/// <reference path="../../types.d.ts" />
import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

const bodySchema = z.object({
  owner: z.string(),
  repo: z.string(),
  token: z.string().optional(),
})

const responseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  watchId: z.string(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'WatchRepo',
  description: 'Start watching a GitHub repository for changes (local dev only)',
  flows: ['gitgalaxy'],
  method: 'POST',
  path: '/api/github/watch',
  bodySchema,
  responseSchema: {
    200: responseSchema,
    500: errorSchema,
  },
  emits: [],
}

export const handler: Handlers['WatchRepo'] = async (req, { logger }) => {
  const { owner, repo } = req.body
  const watchId = `${owner}/${repo}`

  logger.info('Watch request received (local dev only)', { owner, repo })

  // In production, real-time watching requires GitHub webhooks
  // This endpoint is mainly for local development compatibility
  return {
    status: 200,
    body: {
      success: true,
      message: `Watching ${owner}/${repo} (local dev mode)`,
      watchId,
    },
  }
}
