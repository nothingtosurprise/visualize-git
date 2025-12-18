import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

const bodySchema = z.object({
  owner: z.string(),
  repo: z.string(),
  token: z.string().optional(),
})

const responseSchema = z.object({
  success: z.boolean(),
  stars: z.number(),
  name: z.string(),
  fullName: z.string(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'TrackStars',
  description: 'Start tracking a repository stars in real-time',
  flows: ['git-history'],
  method: 'POST',
  path: '/api/github/track-stars',
  bodySchema,
  responseSchema: {
    200: responseSchema,
    500: errorSchema,
  },
  emits: ['fetch-star-history'],
}

export const handler: Handlers['TrackStars'] = async (req, { logger, emit, streams }) => {
  const { owner, repo, token } = req.body
  const fullName = `${owner}/${repo}`

  logger.info('Starting to track repository stars', { owner, repo })

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  }

  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  try {
    // Fetch current repo data
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })

    if (!response.ok) {
      throw new Error(`Failed to fetch repo: ${response.statusText}`)
    }

    const repoData = await response.json()

    // Store initial data in the stars stream
    await streams.stars.set(owner, repo, {
      id: repo,
      stars: repoData.stargazers_count,
      name: repoData.name,
      fullName: repoData.full_name,
      owner: owner,
      description: repoData.description,
      language: repoData.language,
      lastUpdated: new Date().toISOString(),
      history: [],
    })

    // Emit event to fetch full star history in background
    await emit({
      topic: 'fetch-star-history',
      data: { owner, repo, token },
    })

    // Send ephemeral event to notify clients of new tracking
    await streams.stars.send(
      { groupId: owner, id: repo },
      {
        type: 'tracking-started',
        data: { stars: repoData.stargazers_count, name: repoData.name },
      }
    )

    return {
      status: 200,
      body: {
        success: true,
        stars: repoData.stargazers_count,
        name: repoData.name,
        fullName: repoData.full_name,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to track stars', { error: message })
    return {
      status: 500,
      body: { error: message },
    }
  }
}

