import { ApiRouteConfig, Handlers } from 'motia'

/**
 * Embeddable Star Badge SVG API
 * 
 * Usage in GitHub README:
 * ![Stars](https://your-app.motia.cloud/api/embed/badge/owner/repo)
 * 
 * With link:
 * [![Stars](https://your-app.motia.cloud/api/embed/badge/owner/repo)](https://github.com/owner/repo)
 */

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'EmbedStarBadge',
  description: 'Generate embeddable star count badge for GitHub READMEs',
  path: '/api/embed/badge/:owner/:repo',
  method: 'GET',
  queryParams: [
    { name: 'style', description: 'Badge style: flat, flat-square, plastic (default: flat)' },
    { name: 'theme', description: 'Theme: dark, light (default: dark)' },
    { name: 'label', description: 'Custom label (default: ⭐ Stars)' },
    { name: 'token', description: 'GitHub token' },
  ],
  emits: [],
  flows: ['github'],
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return num.toString()
}

function generateBadgeSVG(
  stars: number, 
  label: string, 
  style: string, 
  theme: string
): string {
  const isDark = theme === 'dark'
  const starsText = formatNumber(stars)
  
  // Measure text width (approximate)
  const labelWidth = label.length * 7 + 12
  const valueWidth = starsText.length * 8 + 16
  const totalWidth = labelWidth + valueWidth
  const height = 22

  // Colors
  const labelBg = isDark ? '#1e3a5f' : '#555'
  const valueBg = isDark ? '#fbbf24' : '#fbbf24'
  const labelColor = isDark ? '#e2e8f0' : '#fff'
  const valueColor = '#000'

  // Border radius based on style
  const radius = style === 'flat-square' ? '0' : style === 'plastic' ? '4' : '3'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}">
  <defs>
    <linearGradient id="smooth" x2="0" y2="100%">
      <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <clipPath id="r">
      <rect width="${totalWidth}" height="${height}" rx="${radius}" fill="#fff"/>
    </clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="${labelBg}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${valueBg}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#smooth)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14" fill="${labelColor}">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${starsText}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="${valueColor}" font-weight="600">${starsText}</text>
  </g>
</svg>`
}

export const handler: Handlers['EmbedStarBadge'] = async (req, ctx) => {
  const { owner, repo } = req.pathParams as Record<string, string>
  const { style = 'flat', theme = 'dark', label = '⭐ Stars', token } = req.queryParams as Record<string, string>

  let stars = 0

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitGalaxy-Badge',
    }
    
    // Use query param token or environment variable
    const githubToken = token || process.env.GITHUB_TOKEN
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
    
    if (response.ok) {
      const data = await response.json()
      stars = data.stargazers_count || 0
      ctx.logger.info('Fetched star count', { owner, repo, stars })
    } else {
      ctx.logger.warn('GitHub API error', { status: response.status })
    }
  } catch (error: any) {
    ctx.logger.error('Failed to fetch stars', { error: error.message })
  }

  const svg = generateBadgeSVG(stars, label as string, style as string, theme as string)

  return {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=1800',
      'access-control-allow-origin': '*',
    },
    body: svg,
  }
}

