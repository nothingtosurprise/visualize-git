import { ApiRouteConfig, Handlers } from 'motia';

export interface CommitFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
}

export interface CommitData {
  sha: string;
  message: string;
  date: string;
  author: {
    name: string;
    email: string;
    avatar: string;
  };
  files: CommitFile[];
}

export interface CommitsResponse {
  commits: CommitData[];
  total: number;
  hasMore: boolean;
}

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'Get Commits',
  description: 'Fetches commit history with file changes for git history animation',
  path: '/api/github/commits/:owner/:repo',
  method: 'GET',
  queryParams: [
    { name: 'token', description: 'GitHub personal access token' },
    { name: 'perPage', description: 'Number of commits per page (default: 100)' },
    { name: 'page', description: 'Page number (default: 1)' },
  ],
  emits: [],
  flows: ['github'],
};

export const handler: Handlers['GetCommits'] = async (req, ctx) => {
  const { owner, repo } = req.pathParams as Record<string, string>;
  const queryParams = req.queryParams as Record<string, string>;
  const perPage = parseInt(queryParams.perPage || '100', 10);
  const page = parseInt(queryParams.page || '1', 10);
  const token = queryParams.token || process.env.GITHUB_TOKEN;

  ctx.logger.info('[get-commits] Fetching commits', { owner, repo, perPage, page });

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Git-History',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    // First get the list of commits
    const commitsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
      { headers }
    );

    if (!commitsResponse.ok) {
      const errorText = await commitsResponse.text();
      ctx.logger.error('[get-commits] GitHub API error', { status: commitsResponse.status, error: errorText });
      return {
        status: commitsResponse.status,
        body: { error: `GitHub API error: ${commitsResponse.statusText}` },
      };
    }

    const commitsData = await commitsResponse.json();
    
    // Fetch file changes for each commit (limit to avoid rate limits)
    const commitsWithFiles: CommitData[] = await Promise.all(
      commitsData.slice(0, 50).map(async (commit: any): Promise<CommitData> => {
        try {
          // Fetch individual commit to get file changes
          const commitDetailResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
            { headers }
          );
          
          let files: CommitFile[] = [];
          if (commitDetailResponse.ok) {
            const commitDetail = await commitDetailResponse.json();
            files = (commitDetail.files || []).map((f: any) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
            }));
          }

          return {
            sha: commit.sha,
            message: commit.commit?.message || '',
            date: commit.commit?.author?.date || commit.commit?.committer?.date || '',
            author: {
              name: commit.commit?.author?.name || commit.author?.login || 'Unknown',
              email: commit.commit?.author?.email || '',
              avatar: commit.author?.avatar_url || '',
            },
            files,
          };
        } catch (error) {
          // Return commit without file details on error
          return {
            sha: commit.sha,
            message: commit.commit?.message || '',
            date: commit.commit?.author?.date || commit.commit?.committer?.date || '',
            author: {
              name: commit.commit?.author?.name || commit.author?.login || 'Unknown',
              email: commit.commit?.author?.email || '',
              avatar: commit.author?.avatar_url || '',
            },
            files: [],
          };
        }
      })
    );

    // Sort by date (oldest first for animation)
    commitsWithFiles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    ctx.logger.info('[get-commits] Successfully fetched commits', { 
      owner, 
      repo, 
      count: commitsWithFiles.length 
    });

    return {
      status: 200,
      body: {
        commits: commitsWithFiles,
        total: commitsData.length,
        hasMore: commitsData.length === perPage,
      },
    };
  } catch (error: any) {
    ctx.logger.error('[get-commits] Error fetching commits', { error: error.message });
    return {
      status: 500,
      body: { error: error.message || 'Failed to fetch commits' },
    };
  }
};
