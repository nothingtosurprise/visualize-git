import { CronConfig, Handlers } from 'motia'

export const config: CronConfig = {
  type: 'cron',
  name: 'ScheduledRepoPoll',
  description: 'Polls all watched repositories for updates every 30 seconds',
  flows: ['gitgalaxy'],
  cron: '*/30 * * * * *', // Every 30 seconds
  emits: ['poll-repo-updates'],
}

export const handler: Handlers['ScheduledRepoPoll'] = async ({ emit, logger, state }) => {
  logger.info('Running scheduled repository poll')

  try {
    // Get all watch keys from state
    // Note: This is a simplified approach. In production, you'd want a more efficient way to track watched repos
    const watchedRepos = await state.get<string[]>('watched-repos')

    if (!watchedRepos || watchedRepos.length === 0) {
      logger.info('No repositories being watched')
      return
    }

    for (const watchId of watchedRepos) {
      const watchState = await state.get<{
        owner: string
        repo: string
        token?: string
        lastChecked: string
        lastSha: string | null
      }>(`watch:${watchId}`)

      if (watchState) {
        logger.info('Triggering poll for watched repo', { watchId })
        
        await emit({
          topic: 'poll-repo-updates',
          data: {
            owner: watchState.owner,
            repo: watchState.repo,
            token: watchState.token,
          },
        })
      }
    }

    logger.info('Scheduled poll completed', { repoCount: watchedRepos.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Scheduled poll failed', { error: message })
  }
}

