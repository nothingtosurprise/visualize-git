import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

const MAX_NODES = 2000 // Limit nodes to prevent performance issues (increased for large repos)

const nodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['blob', 'tree']),
  path: z.string(),
  size: z.number().optional(),
  extension: z.string().optional(),
  parentId: z.string().nullable().optional(),
  fx: z.number().optional(),
  fy: z.number().optional(),
})

const linkSchema = z.object({
  source: z.string(),
  target: z.string(),
})

const responseSchema = z.object({
  nodes: z.array(nodeSchema),
  links: z.array(linkSchema),
})

const errorSchema = z.object({
  error: z.string(),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'GetRepoTree',
  description: 'Fetches GitHub repository file tree and transforms it for visualization',
  flows: ['git-history'],
  method: 'GET',
  path: '/api/github/tree/:owner/:repo',
  queryParams: [
    { name: 'token', description: 'GitHub personal access token (optional)' },
    { name: 'branch', description: 'Branch to fetch (defaults to main)' },
  ],
  responseSchema: {
    200: responseSchema,
    403: errorSchema,
    500: errorSchema,
  },
  emits: [],
}

interface TreeItem {
  path: string
  mode: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
  url: string
}

interface RepoNode {
  id: string
  name: string
  type: 'blob' | 'tree'
  path: string
  size?: number
  extension?: string
  parentId?: string | null
  fx?: number
  fy?: number
}

interface RepoLink {
  source: string
  target: string
}

export const handler: Handlers['GetRepoTree'] = async (req, { logger }) => {
  const { owner, repo } = req.pathParams
  const token = req.queryParams.token as string | undefined
  const branch = (req.queryParams.branch as string) || 'main'

  logger.info('Fetching repo tree', { owner, repo, branch })

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  }

  const githubToken = token || process.env.GITHUB_TOKEN
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    const response = await fetch(url, { headers })

    if (!response.ok) {
      if (response.status === 403) {
        logger.warn('API Rate Limit Exceeded', { owner, repo })
        return {
          status: 403,
          body: { error: 'API Rate Limit Exceeded. Please provide a token.' },
        }
      }
      throw new Error(`Failed to fetch file tree: ${response.statusText}`)
    }

    const data = await response.json()
    const tree: TreeItem[] = data.tree

    // Process tree into Nodes and Links
    // Prioritize folders (trees) over files to preserve structure
    let slicedTree: TreeItem[]
    if (tree.length > MAX_NODES) {
      const folders = tree.filter(item => item.type === 'tree')
      const files = tree.filter(item => item.type === 'blob')
      const remainingSlots = MAX_NODES - folders.length
      slicedTree = [...folders, ...files.slice(0, Math.max(0, remainingSlots))]
      logger.info('Tree truncated', { 
        original: tree.length, 
        folders: folders.length, 
        filesIncluded: Math.min(files.length, remainingSlots),
        total: slicedTree.length 
      })
    } else {
      slicedTree = tree
    }

    const nodes: RepoNode[] = []
    const links: RepoLink[] = []
    const pathMap = new Map<string, RepoNode>()

    // Add root node
    const rootNode: RepoNode = {
      id: 'ROOT',
      name: repo,
      type: 'tree',
      path: '',
      fx: 0,
      fy: 0,
    }
    nodes.push(rootNode)
    pathMap.set('', rootNode)

    slicedTree.forEach((item) => {
      const parts = item.path.split('/')
      const name = parts[parts.length - 1]
      const parentPath = parts.slice(0, -1).join('/')

      // Determine extension
      const extension =
        item.type === 'blob' && name.includes('.')
          ? name.split('.').pop()?.toLowerCase()
          : undefined

      const node: RepoNode = {
        id: item.path,
        name: name,
        type: item.type,
        path: item.path,
        size: item.size,
        extension,
        parentId: parentPath || 'ROOT',
      }

      nodes.push(node)
      pathMap.set(item.path, node)

      // Create link
      const parentId = parentPath === '' ? 'ROOT' : parentPath

      if (pathMap.has(parentId)) {
        links.push({
          source: parentId,
          target: item.path,
        })
      } else {
        // If parent missing (due to slice), link to root to keep it connected
        links.push({
          source: 'ROOT',
          target: item.path,
        })
      }
    })

    logger.info('Repo tree processed successfully', {
      owner,
      repo,
      nodeCount: nodes.length,
      linkCount: links.length,
    })

    return {
      status: 200,
      body: { nodes, links },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to fetch repo tree', { error: message })
    return {
      status: 500,
      body: { error: message },
    }
  }
}

