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
  description: 'Start watching a GitHub repository for changes',
  flows: ['gitgalaxy'],
  method: 'POST',
  path: '/api/github/watch',
  bodySchema,
  responseSchema: {
    200: responseSchema,
    500: errorSchema,
  },
  emits: ['poll-repo-updates'],
}

export const handler: Handlers['WatchRepo'] = async (req, { logger, emit, state, streams }) => {
  const { owner, repo, token } = req.body
  const watchId = `${owner}/${repo}`

  logger.info('Starting to watch repository', { owner, repo })

  try {
    // Store watch config in state
    await state.set(`watch:${watchId}`, {
      owner,
      repo,
      token,
      lastChecked: new Date().toISOString(),
      lastSha: null,
    }, { ttl: 3600 * 24 }) // 24 hour TTL

    // Add to watched repos list for cron job
    const watchedRepos = await state.get<string[]>('watched-repos') || []
    if (!watchedRepos.includes(watchId)) {
      watchedRepos.push(watchId)
      await state.set('watched-repos', watchedRepos, { ttl: 3600 * 24 })
    }

    // Emit initial poll event
    await emit({
      topic: 'poll-repo-updates',
      data: { owner, repo, token },
    })

    // Send initial update via stream
    await streams.repoUpdates.set(watchId, watchId, {
      id: watchId,
      owner,
      repo,
      type: 'refresh',
      message: `Started watching ${owner}/${repo}`,
      timestamp: new Date().toISOString(),
    })

    return {
      status: 200,
      body: {
        success: true,
        message: `Now watching ${owner}/${repo} for changes`,
        watchId,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to start watching repo', { error: message })
    return {
      status: 500,
      body: { error: message },
    }
  }
}

