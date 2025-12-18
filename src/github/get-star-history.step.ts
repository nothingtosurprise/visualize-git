import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

const starDataPointSchema = z.object({
  date: z.string(),
  stars: z.number(),
})

const responseSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  totalStars: z.number(),
  history: z.array(starDataPointSchema),
})

const errorSchema = z.object({
  error: z.string(),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'GetStarHistory',
  description: 'Fetches GitHub repository star history with timestamps',
  flows: ['git-history'],
  method: 'GET',
  path: '/api/github/stars/:owner/:repo',
  queryParams: [
    { name: 'token', description: 'GitHub personal access token (recommended for rate limits)' },
  ],
  responseSchema: {
    200: responseSchema,
    403: errorSchema,
    500: errorSchema,
  },
  emits: [],
}

interface StargazerWithDate {
  starred_at: string
  user: { login: string }
}

export const handler: Handlers['GetStarHistory'] = async (req, { logger }) => {
  const { owner, repo } = req.pathParams
  const token = req.queryParams.token as string | undefined

  logger.info('Fetching star history', { owner, repo })

  const headers: HeadersInit = {
    // This header gives us starred_at timestamps
    Accept: 'application/vnd.github.star+json',
  }

  const githubToken = token || process.env.GITHUB_TOKEN
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`
  }

  try {
    // First get total star count
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github.v3+json', ...headers },
    })

    if (!repoResponse.ok) {
      throw new Error(`Failed to fetch repo: ${repoResponse.statusText}`)
    }

    const repoData = await repoResponse.json()
    const totalStars = repoData.stargazers_count

    // Fetch stargazers with timestamps (paginated, get sample for chart)
    // GitHub limits to 400 pages max, so we sample strategically
    const history: { date: string; stars: number }[] = []
    
    // For repos with many stars, sample pages to build history
    const starsPerPage = 100
    const totalPages = Math.ceil(totalStars / starsPerPage)
    
    // Sample up to 10 pages spread across the history
    const pagesToFetch = Math.min(10, totalPages)
    const pageStep = Math.max(1, Math.floor(totalPages / pagesToFetch))

    for (let i = 0; i < pagesToFetch; i++) {
      const page = Math.min(i * pageStep + 1, totalPages)
      const url = `https://api.github.com/repos/${owner}/${repo}/stargazers?per_page=${starsPerPage}&page=${page}`
      
      const response = await fetch(url, { headers })
      
      if (response.status === 403) {
        logger.warn('Rate limit hit', { page })
        break
      }
      
      if (!response.ok) {
        logger.warn('Failed to fetch page', { page, status: response.status })
        continue
      }

      const stargazers: StargazerWithDate[] = await response.json()
      
      if (stargazers.length > 0) {
        // Get the first star date from this page
        const firstStar = stargazers[0]
        if (firstStar.starred_at) {
          const starCount = (page - 1) * starsPerPage + 1
          history.push({
            date: firstStar.starred_at.split('T')[0],
            stars: starCount,
          })
        }
      }
    }

    // Add current total
    history.push({
      date: new Date().toISOString().split('T')[0],
      stars: totalStars,
    })

    // Sort by date
    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Remove duplicates and ensure monotonic increase
    const uniqueHistory = history.reduce((acc, point) => {
      if (acc.length === 0 || point.date !== acc[acc.length - 1].date) {
        acc.push(point)
      }
      return acc
    }, [] as typeof history)

    logger.info('Star history fetched', { owner, repo, dataPoints: uniqueHistory.length })

    return {
      status: 200,
      body: {
        owner,
        repo,
        totalStars,
        history: uniqueHistory,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to fetch star history', { error: message })
    
    if (message.includes('rate limit')) {
      return {
        status: 403,
        body: { error: 'GitHub API rate limit exceeded. Please provide a token.' },
      }
    }
    
    return {
      status: 500,
      body: { error: message },
    }
  }
}

