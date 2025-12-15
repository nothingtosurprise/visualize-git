import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  token: z.string().optional(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'PollRepoUpdates',
  description: 'Polls GitHub for repository updates and streams changes',
  flows: ['gitgalaxy'],
  subscribes: ['poll-repo-updates'],
  emits: [],
  input: inputSchema,
}

interface CommitInfo {
  sha: string
  commit: {
    message: string
    author: {
      name: string
      date: string
    }
  }
}

export const handler: Handlers['PollRepoUpdates'] = async (input, { logger, state, streams }) => {
  const { owner, repo, token } = input
  const watchId = `${owner}/${repo}`

  logger.info('Polling repository for updates', { owner, repo })

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  }

  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  try {
    // Fetch latest commits
    const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`
    const response = await fetch(commitsUrl, { headers })

    if (!response.ok) {
      logger.warn('Failed to fetch commits', { status: response.status })
      return
    }

    const commits: CommitInfo[] = await response.json()

    if (commits.length === 0) {
      logger.info('No commits found')
      return
    }

    // Get stored state
    const watchState = await state.get<{
      owner: string
      repo: string
      token?: string
      lastChecked: string
      lastSha: string | null
    }>(`watch:${watchId}`)

    const lastSha = watchState?.lastSha
    const latestSha = commits[0].sha

    // Check if there are new commits
    if (lastSha !== latestSha) {
      logger.info('New commits detected', { lastSha, latestSha })

      // Find new commits since last check
      const newCommits = lastSha 
        ? commits.filter((c, i) => {
            const lastIndex = commits.findIndex(commit => commit.sha === lastSha)
            return lastIndex === -1 ? true : i < lastIndex
          })
        : [commits[0]]

      // Stream updates for each new commit
      for (const commit of newCommits) {
        const updateId = `${watchId}:${commit.sha.substring(0, 7)}`
        
        await streams.repoUpdates.set(watchId, updateId, {
          id: updateId,
          owner,
          repo,
          type: 'commit',
          message: commit.commit.message.split('\n')[0], // First line only
          author: commit.commit.author.name,
          sha: commit.sha.substring(0, 7),
          timestamp: commit.commit.author.date,
        })

        // Also send ephemeral event for immediate notification
        await streams.repoUpdates.send(
          { groupId: watchId },
          {
            type: 'new-commit',
            data: {
              sha: commit.sha.substring(0, 7),
              message: commit.commit.message.split('\n')[0],
              author: commit.commit.author.name,
            },
          }
        )
      }

      // Update state with latest SHA
      await state.set(`watch:${watchId}`, {
        owner,
        repo,
        token,
        lastChecked: new Date().toISOString(),
        lastSha: latestSha,
      }, { ttl: 3600 * 24 })

      logger.info('Streamed updates for new commits', { count: newCommits.length })
    } else {
      logger.info('No new commits since last check')
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to poll repo updates', { error: message })
  }
}

