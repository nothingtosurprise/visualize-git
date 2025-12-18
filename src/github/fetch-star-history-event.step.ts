import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  token: z.string().optional(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'FetchStarHistoryEvent',
  description: 'Background job to fetch and store star history data',
  flows: ['git-history'],
  subscribes: ['fetch-star-history'],
  emits: [],
  input: inputSchema,
}

interface StargazerWithDate {
  starred_at: string
  user: { login: string }
}

export const handler: Handlers['FetchStarHistoryEvent'] = async (input, { logger, streams }) => {
  const { owner, repo, token } = input

  logger.info('Fetching star history in background', { owner, repo })

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.star+json',
  }

  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  try {
    // Get current stream data
    const currentData = await streams.stars.get(owner, repo)
    if (!currentData) {
      logger.warn('No stream data found', { owner, repo })
      return
    }

    // Fetch total star count
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github.v3+json', ...headers },
    })

    if (!repoResponse.ok) {
      throw new Error(`Failed to fetch repo: ${repoResponse.statusText}`)
    }

    const repoData = await repoResponse.json()
    const totalStars = repoData.stargazers_count

    // Fetch stargazers with timestamps
    const history: { date: string; stars: number }[] = []
    const starsPerPage = 100
    const totalPages = Math.ceil(totalStars / starsPerPage)
    const pagesToFetch = Math.min(15, totalPages)
    const pageStep = Math.max(1, Math.floor(totalPages / pagesToFetch))

    for (let i = 0; i < pagesToFetch; i++) {
      const page = Math.min(i * pageStep + 1, totalPages)
      const url = `https://api.github.com/repos/${owner}/${repo}/stargazers?per_page=${starsPerPage}&page=${page}`
      
      const response = await fetch(url, { headers })
      
      if (response.status === 403) {
        logger.warn('Rate limit hit', { page })
        break
      }
      
      if (!response.ok) continue

      const stargazers: StargazerWithDate[] = await response.json()
      
      if (stargazers.length > 0 && stargazers[0].starred_at) {
        history.push({
          date: stargazers[0].starred_at.split('T')[0],
          stars: (page - 1) * starsPerPage + 1,
        })
      }
    }

    // Add current total
    history.push({
      date: new Date().toISOString().split('T')[0],
      stars: totalStars,
    })

    // Sort and deduplicate
    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const uniqueHistory = history.reduce((acc, point) => {
      if (acc.length === 0 || point.date !== acc[acc.length - 1].date) {
        acc.push(point)
      }
      return acc
    }, [] as typeof history)

    // Update stream with history
    await streams.stars.set(owner, repo, {
      ...currentData,
      stars: totalStars,
      history: uniqueHistory,
      lastUpdated: new Date().toISOString(),
    })

    // Send update event to connected clients
    await streams.stars.send(
      { groupId: owner, id: repo },
      {
        type: 'history-updated',
        data: { stars: totalStars, historyPoints: uniqueHistory.length },
      }
    )

    logger.info('Star history fetched and stored', { owner, repo, dataPoints: uniqueHistory.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to fetch star history', { error: message })
  }
}

