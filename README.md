# GitGalaxy ✦

A beautiful GitHub repository visualizer with star history tracking, powered by **Motia**.

![GitGalaxy Screenshot](./public/galaxy.png)
![git star history](./public/git-star-history.png)

## Features

- 🌌 **Interactive Graph** - Force-directed visualization of repository structure with D3.js
- ⭐ **Star History** - Real star history data fetched from GitHub API with beautiful charts
- 🔴 **Live Updates** - Real-time streaming of commits and changes using Motia Streams
- 📊 **Embeddable Charts** - Generate SVG badges and charts for your README
- 🎨 **Developer Aesthetic** - Dark theme with Motia colors (cyan, blue, gold)
- 🔌 **Chrome Extension** - View star history directly on GitHub pages

## Quick Start

### Prerequisites

- Node.js 18+ (with npm)
- GitHub Personal Access Token (optional but recommended)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd gitgalaxy
npm install
```

### 2. Configure GitHub Token (Optional)

To avoid GitHub API rate limits, create a [Personal Access Token](https://github.com/settings/tokens) with `public_repo` scope.

Create a `.env` file in the project root:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Rate Limits:**
- Without token: 60 requests/hour ⚠️
- With token: 5,000 requests/hour ✅

### 3. Start Development Servers

```bash
# Terminal 1: Start Motia backend (port 3001)
npm run dev

# Terminal 2: Start Vite frontend (port 3000)
npm run olddev
```

Open [http://localhost:3000](http://localhost:3000) and enter any GitHub repo like `facebook/react`!

## How It Works

### Architecture Overview

```
┌─────────────────┐     ┌─────────────────────────┐     ┌─────────────┐
│  React Frontend │────▶│    Motia Backend API    │────▶│  GitHub API │
│  (Vite + D3.js) │◀────│  - API Steps            │◀────│             │
└─────────────────┘     │  - Event Steps          │     └─────────────┘
                        │  - Cron Jobs            │
┌─────────────────┐     │  - Real-time Streams    │
│ Chrome Extension│────▶│                         │
└─────────────────┘     └─────────────────────────┘
```

### Flow Diagram

**1. User enters a GitHub repo → Visualization**
```
User Input (owner/repo)
    ↓
Frontend fetches /api/github/tree/:owner/:repo
    ↓
Motia API Step fetches from GitHub API
    ↓
Returns transformed nodes + links
    ↓
D3.js renders force-directed graph
    ↓
User can zoom, pan, drag nodes, search, hover
```

**2. Star History Feature**
```
User clicks "Star History" in sidebar
    ↓
Frontend fetches /api/github/stars/:owner/:repo
    ↓
Motia API Step samples stargazer pages from GitHub
    ↓
Returns historical data points
    ↓
Custom SVG chart renders growth curve
    ↓
Shows stats: total stars, data points, first tracked date
```

**3. Live Updates (Real-time Streaming)**
```
User clicks "Watch for Updates"
    ↓
Frontend calls POST /api/github/watch
    ↓
Motia stores watched repo in state
    ↓
Cron Step (every 30s) emits poll-repo-updates event
    ↓
Event Step fetches latest commits from GitHub
    ↓
Emits updates to repo-updates Stream
    ↓
Frontend subscribes to stream via SSE
    ↓
Shows live commit feed in UI
```

**4. Embeddable SVG Charts**
```
User embeds in README: ![Chart](https://your-app.motia.cloud/api/embed/stars?repos=owner/repo)
    ↓
GitHub/browser requests image URL
    ↓
Motia API Step fetches star history
    ↓
Generates SVG with D3-like styling
    ↓
Returns image/svg+xml response
    ↓
Displays beautiful chart in README
```

### Key Motia Concepts Used

- **API Steps**: HTTP endpoints for synchronous requests (repo details, tree, star history)
- **Event Steps**: Background tasks triggered by events (polling GitHub for updates)
- **Cron Steps**: Scheduled tasks (polling every 30 seconds)
- **Streams**: Real-time data streaming (SSE for live commit updates)
- **State Management**: Storing watched repositories across requests

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/github/repo/:owner/:repo` | Fetch repository details |
| `GET /api/github/tree/:owner/:repo` | Fetch file tree for visualization |
| `GET /api/github/stars/:owner/:repo` | Fetch star history |
| `GET /api/embed/stars` | **Embeddable SVG star history chart** |
| `GET /api/embed/badge/:owner/:repo` | **Embeddable star count badge** |
| `POST /api/github/watch` | Start watching a repo for updates |
| `POST /api/github/track-stars` | Track stars in real-time |

All endpoints support optional `?token=ghp_xxx` query parameter for higher rate limits.

## 📊 Embeddable Charts & Badges

Once deployed, you can embed star history charts and badges anywhere! These are dynamic SVG images generated by your Motia backend.

### Star History Chart

After deploying to Vercel (see [Deploy Frontend to Vercel](#deploy-frontend-to-vercel)), use this format:

```markdown
[![Star History Chart](https://your-project.vercel.app/api/embed/stars?repos=owner/repo)](https://github.com/owner/repo)
```

**API Endpoint:** `GET /api/embed/stars`

**Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `repos` | Comma-separated repos (required) | `motiadev/motia` or `motiadev/motia,vercel/next.js` |
| `theme` | `dark` or `light` (default: `dark`) | `theme=light` |
| `type` | Chart type (default: `Date`) | `type=Date` |
| `token` | GitHub token for higher rate limits | `token=ghp_xxx` |

**Multiple repos example:**
```markdown
[![Star History](https://your-project.vercel.app/api/embed/stars?repos=motiadev/motia,vercel/next.js&theme=dark)](https://github.com)
```

### Star Badge

```markdown
![Stars](https://your-project.vercel.app/api/embed/badge/owner/repo)
```

**API Endpoint:** `GET /api/embed/badge/:owner/:repo`

**Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `style` | `flat`, `flat-square`, `plastic` | `?style=flat-square` |
| `theme` | `dark` or `light` (default: `dark`) | `?theme=light` |
| `label` | Custom label text | `?label=GitHub%20Stars` |
| `token` | GitHub token for higher rate limits | `?token=ghp_xxx` |

**Examples:**
```markdown
<!-- Simple badge -->
![Stars](https://your-project.vercel.app/api/embed/badge/facebook/react)

<!-- With custom label -->
![Stars](https://your-project.vercel.app/api/embed/badge/facebook/react?label=⭐%20React)

<!-- Light theme -->
![Stars](https://your-project.vercel.app/api/embed/badge/facebook/react?theme=light)
```

> **Note:** Replace `your-project.vercel.app` with your actual Vercel deployment URL.

## Deploy Backend to Motia Cloud

Deploy your Motia backend to **Motia Cloud**. This will be used privately by your Vercel frontend as a proxy.

> 📖 Full deployment guide: [Motia Cloud Deployment](https://www.motia.dev/docs/deployment-guide/motia-cloud/deployment)
> 
> **Important:** After deploying, you'll use Vercel as the public-facing URL. The Motia backend URL stays private.

### Method 1: Deploy via CLI (Recommended)

**Step 1:** Get your API key from [Motia Cloud Dashboard](https://cloud.motia.dev)

**Step 2:** Create `.env.production` file:

```bash
# Required for production to avoid rate limits
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Get your token from: https://github.com/settings/tokens (scope: `public_repo`)

**Step 3:** Deploy using Motia CLI:

```bash
# Deploy with environment variables
npx motia cloud deploy \
  --api-key <your-api-key> \
  --version-name v1.0.0 \
  --env-file .env.production \
  --version-description "Initial production release"

# Or use environment variable
export MOTIA_API_KEY=<your-api-key>
npx motia cloud deploy --version-name v1.0.0 --env-file .env.production
```

**CLI Options:**
| Option | Description | Required |
|--------|-------------|----------|
| `--api-key` `-k` | Your Motia Cloud API key | ✅ Yes |
| `--version-name` `-v` | Version tag (e.g., v1.0.0) | ✅ Yes |
| `--env-file` `-e` | Path to .env file | Recommended |
| `--environment-id` `-s` | Specific environment ID | Optional |
| `--version-description` `-d` | Deployment description | Optional |

### Method 2: One-Click Deploy from Workbench

1. Ensure your local project is running (`npm run dev`)
2. Go to [Motia Cloud Dashboard](https://cloud.motia.dev)
3. Click **"Import from Workbench"**
4. Select the port (3001) and your project
5. Upload your `.env.production` file or paste environment variables
6. Click **"Deploy"** and watch the magic! 🚀

### After Deployment

**Your API will be live at:** `https://your-project-id.hub.motia.cloud`

#### Update Chrome Extension URLs

Edit these files to use your deployed API:
- `chrome-extension/popup.js`
- `chrome-extension/content.js`

```javascript
// Replace with your deployment URL
const API_BASE = 'https://your-project-id.hub.motia.cloud';
```

#### Test Your Deployed API

```bash
# Test repo details
curl "https://your-project-id.hub.motia.cloud/api/github/repo/facebook/react"

# Test star history
curl "https://your-project-id.hub.motia.cloud/api/github/stars/facebook/react"

# Test embed chart (view in browser)
open "https://your-project-id.hub.motia.cloud/api/embed/stars?repos=facebook/react"
```

### Environment Variables in Production

Set these in Motia Cloud dashboard or via `--env-file`:

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | **Highly Recommended** |

**Why GitHub Token?**
- Without token: 60 requests/hour ⚠️ (will fail quickly)
- With token: 5,000 requests/hour ✅ (production-ready)

### Continuous Deployment

Set up GitHub Actions or use Motia's continuous deployment features to auto-deploy on push:

```bash
# In your CI/CD pipeline
npx motia cloud deploy \
  --api-key $MOTIA_API_KEY \
  --version-name $GITHUB_SHA \
  --env-file .env.production
```

See [Motia Continuous Deployment docs](https://www.motia.dev/docs/deployment-guide/motia-cloud/continuous-deployment) for more.

## Deploy Frontend to Vercel

Deploy your React frontend to **Vercel** for global edge hosting with zero configuration.

> **Architecture**: Frontend (Vercel) + Backend (Motia Cloud)

### Prerequisites

1. Deploy your Motia backend first (see [Deploy to Production](#deploy-to-production))
2. Get your deployment URL (e.g., `https://abc123.hub.motia.cloud`)
3. Have a [Vercel account](https://vercel.com) (free tier works)

### Method 1: Deploy via Vercel CLI (Recommended)

**Step 1:** Install Vercel CLI

```bash
npm install -g vercel
```

**Step 2:** Set environment variable

Create a `.env.production` file for frontend:

```bash
# Your deployed Motia backend URL
VITE_API_BASE=https://your-project-id.hub.motia.cloud
```

**Step 3:** Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy (production)
vercel --prod

# During setup, answer:
# - Framework: Vite
# - Build Command: npm run build
# - Output Directory: dist
```

Vercel will automatically read `VITE_API_BASE` from `.env.production` or you can set it in the Vercel dashboard.

### Method 2: Deploy via Vercel Dashboard (One-Click)

**Step 1:** Push your code to GitHub

```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

**Step 2:** Import to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/new)
2. Click **"Import Project"**
3. Select your GitHub repository
4. Vercel auto-detects Vite settings ✅
5. Add environment variable:
   - **Name**: `VITE_API_BASE`
   - **Value**: `https://your-project-id.hub.motia.cloud` (your Motia backend URL)
6. Click **"Deploy"**

**Step 3:** Your site is live! 🚀

Visit: `https://your-project.vercel.app`

### Connecting Frontend to Backend

The frontend automatically connects to your Motia backend using the `VITE_API_BASE` environment variable:

```typescript
// services/githubService.ts
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'
```

**For local development:**
```bash
# .env.local
VITE_API_BASE=http://localhost:3001
```

**For production (Vercel):**
```bash
# Set in Vercel Dashboard → Settings → Environment Variables
VITE_API_BASE=https://your-project.vercel.app  # Your Vercel URL, NOT the Motia backend
MOTIA_BACKEND_URL=https://your-backend.hub.motia.cloud  # Motia backend (private, used by proxy)
```

### Update Chrome Extension URLs

After deploying frontend to Vercel, update `chrome-extension/config.js`:

```javascript
// chrome-extension/config.js
const API_BASE = 'https://your-actual-project.vercel.app';
```

**Important:** The extension should ONLY use the Vercel URL. Never expose the Motia backend URL.

### Vercel Configuration

The included `vercel.json` handles SPA routing:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Environment Variables Reference

| Variable | Where to Set | Value | Purpose |
|----------|--------------|-------|---------|
| `VITE_API_BASE` | Vercel Dashboard | `https://your-project.vercel.app` | Frontend calls go to Vercel (public) |
| `MOTIA_BACKEND_URL` | Vercel Dashboard | `https://xxx.hub.motia.cloud` | Vercel proxy → Motia backend (private) |
| `GITHUB_TOKEN` | Motia Cloud Dashboard | `ghp_xxx...` | Backend → GitHub API auth |

### Testing Your Deployment

```bash
# Test frontend (should open Vercel site)
open https://your-project.vercel.app

# Test API connection through Vercel proxy
curl "https://your-project.vercel.app/api/github/repo/facebook/react"

# Test embed chart (proxied through Vercel)
open "https://your-project.vercel.app/api/embed/stars?repos=facebook/react"

# The Motia backend URL should NEVER be exposed publicly
```

### Automatic Deployments

Vercel automatically deploys on every push to your repository:

- **Production**: Deploys from `main` branch → `your-project.vercel.app`
- **Preview**: Deploys from PRs/branches → `your-project-git-branch.vercel.app`

### Custom Domain

Add your own domain in Vercel Dashboard:

1. Go to **Settings → Domains**
2. Add domain (e.g., `gitgalaxy.com`)
3. Update DNS records as instructed
4. Update `VITE_API_BASE` if backend URL changes

### Troubleshooting Vercel Deployment

**Build fails with "VITE_API_BASE not defined"**
- This is a warning, not an error. It will fallback to localhost for local dev
- Set in Vercel Dashboard → Settings → Environment Variables

**API calls fail with CORS errors**
- Ensure `VITE_API_BASE` points to your deployed Motia backend
- Motia Cloud handles CORS automatically, no config needed

**404 on page refresh**
- Ensure `vercel.json` includes the rewrite rule (already included)
- Vercel should auto-detect SPA routing

**Can't connect to backend**
- Verify both Vercel and Motia backend are deployed
- Test Vercel proxy: `curl https://your-project.vercel.app/api/github/repo/facebook/react`
- Check `MOTIA_BACKEND_URL` is set correctly in Vercel environment variables
- Check browser console for exact error

## Chrome Extension

The `chrome-extension/` folder contains a Chrome extension that injects star history on GitHub repository pages.

### Local Testing

1. Deploy your backend first (see above) or use `http://localhost:3001`
2. Update `API_BASE` in `popup.js` and `content.js`
3. Go to `chrome://extensions/`
4. Enable **"Developer mode"** (top right)
5. Click **"Load unpacked"**
6. Select the `chrome-extension` folder

### Publishing to Chrome Web Store

After deployment:
1. Update all API URLs to your production URL
2. Generate icons: open `chrome-extension/icons/generate-icons.html`
3. Zip the `chrome-extension` folder
4. Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

See [chrome-extension/README.md](chrome-extension/README.md) for detailed instructions.

## Tech Stack

- **Backend**: [Motia](https://motia.dev) - Event-driven backend framework with API Steps, Event Steps, Cron Jobs, and Streams
- **Frontend**: React 18 + Vite + TypeScript
- **Visualization**: D3.js v7 (force-directed graphs)
- **Styling**: Tailwind CSS 3
- **Animation**: Framer Motion
- **Validation**: Zod schemas
- **Chrome Extension**: Manifest V3

## Development Guide

### Project Structure

```
gitgalaxy/
├── src/
│   └── github/              # Motia Backend Steps
│       ├── get-repo-details.step.ts    # API: Fetch repo metadata
│       ├── get-repo-tree.step.ts       # API: Fetch file tree
│       ├── get-star-history.step.ts    # API: Fetch star history
│       ├── embed-stars.step.ts         # API: Generate SVG chart
│       ├── embed-badge.step.ts         # API: Generate SVG badge
│       ├── watch-repo.step.ts          # API: Start watching repo
│       ├── poll-repo-updates.step.ts   # Event: Poll for updates
│       ├── scheduled-poll.step.ts      # Cron: Scheduled polling
│       ├── repo-updates.stream.ts      # Stream: Live repo updates
│       └── stars.stream.ts             # Stream: Live star tracking
├── components/              # React Frontend Components
│   ├── Visualizer.tsx       # D3.js force-directed graph
│   ├── StarHistory.tsx      # Star history mini chart
│   ├── StarHistoryPage.tsx  # Full-page star history
│   ├── Controls.tsx         # Repo input + token field
│   ├── Sidebar.tsx          # File tree + repo info
│   ├── SearchBar.tsx        # File search/filter
│   └── StarAnimation.tsx    # Animated star bursts
├── services/
│   └── githubService.ts     # Frontend API client
├── chrome-extension/        # Chrome Extension
│   ├── manifest.json
│   ├── popup.html/js        # Extension popup
│   └── content.js/css       # GitHub page injector
├── App.tsx                  # Main React app
├── motia.config.ts          # Motia configuration
└── package.json
```

### Working on Motia Backend

#### Creating a New API Step

1. Create file: `src/github/my-feature.step.ts`
2. Define config and handler:

```typescript
import { ApiRouteConfig } from 'motia'
import { z } from 'zod'

export const config: ApiRouteConfig = {
  name: 'My Feature',
  type: 'api',
  method: 'GET',
  path: '/api/github/my-feature/:param',
  path: z.object({ param: z.string() }),
  queryParams: z.object({ token: z.string().optional() }),
}

export const handler = async ({ path, queryParams }) => {
  const { param } = path
  const { token } = queryParams
  
  // Your logic here
  
  return { success: true, data: { /* your data */ } }
}
```

3. Generate types: `npx motia generate-types`
4. Test in Workbench: `npm run dev` → http://localhost:3001

#### Creating an Event Step (Background Job)

```typescript
import { EventConfig } from 'motia'

export const config: EventConfig = {
  name: 'Process Data',
  type: 'event',
  subscribes: ['my-topic'],
  emits: [{ topic: 'processed-data', label: 'Data Processed' }],
}

export const handler = async ({ input, emit }) => {
  // Background processing
  await emit('processed-data', { result: 'done' })
}
```

#### Creating a Cron Step (Scheduled Task)

```typescript
import { CronConfig } from 'motia'

export const config: CronConfig = {
  name: 'Daily Cleanup',
  type: 'cron',
  cron: '0 0 * * *', // Every day at midnight
  emits: [{ topic: 'cleanup-done', label: 'Cleanup Complete' }],
}

export const handler = async ({ emit }) => {
  // Scheduled task
  await emit('cleanup-done', {})
}
```

### Working on React Frontend

#### Adding a New Feature

1. Create component in `components/MyFeature.tsx`
2. Import and use in `App.tsx` or other components
3. Call Motia API via `services/githubService.ts`:

```typescript
// In githubService.ts
export async function myNewFeature(param: string, token?: string) {
  const tokenQuery = token ? `?token=${token}` : ''
  const response = await fetch(`${API_BASE}/api/github/my-feature/${param}${tokenQuery}`)
  return response.json()
}

// In your component
const data = await myNewFeature('value', currentToken)
```

### Common Development Tasks

```bash
# Generate types after modifying Motia steps
npx motia generate-types

# Start Motia Workbench (visual editor + API testing)
npm run dev
# Visit: http://localhost:3001

# Start frontend dev server with hot reload
npm run olddev
# Visit: http://localhost:3000

# Test a specific API endpoint locally
curl "http://localhost:3001/api/github/repo/facebook/react"

# Test with token
curl "http://localhost:3001/api/github/repo/facebook/react?token=ghp_xxx"
```

### Debugging

**Backend (Motia):**
- Check terminal running `npm run dev` for errors
- Visit Workbench at http://localhost:3001 to test steps visually
- Use `console.log()` in step handlers (output in terminal)

**Frontend (React):**
- Check browser console (F12) for errors
- React DevTools extension for component inspection
- Network tab to inspect API calls

**Common Issues:**

| Issue | Solution |
|-------|----------|
| `Property 'X' does not exist on type 'Handlers'` | Run `npx motia generate-types` |
| Motia starts on port 3001 | Port 3000 is in use, update `githubService.ts` |
| GitHub API rate limit (403) | Add `GITHUB_TOKEN` to `.env` |
| CORS errors | Motia handles CORS automatically, check API_BASE URL |

### Testing Changes

1. **Backend:** Make changes to a step → Motia hot reloads automatically
2. **Frontend:** Make changes to components → Vite hot reloads automatically
3. **Full flow:** Test in browser at http://localhost:3000

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test locally
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## Troubleshooting

### Backend Issues

**Motia won't start / Port already in use**
```bash
# Find process on port 3001
lsof -i :3001
# Kill it
kill -9 <PID>
# Or change Motia port in motia.config.ts
```

**Type errors: `Property 'X' does not exist on type 'Handlers'`**
```bash
# Regenerate types after adding/modifying steps
npx motia generate-types
```

**GitHub API rate limit (403 error)**
```bash
# Add token to .env
echo "GITHUB_TOKEN=ghp_xxxxxxxxxxxx" >> .env
# Restart Motia
npm run dev
```

### Frontend Issues

**Can't connect to backend**
- Check `services/githubService.ts` has correct `API_BASE` (http://localhost:3001)
- Ensure Motia is running (`npm run dev` in terminal 1)
- Check browser console for CORS errors

**Visualization not loading**
- Open browser DevTools (F12) → Network tab
- Look for failed `/api/github/tree` request
- Check the response for error details
- Verify repo name format is `owner/repo`

**Star history shows wrong data**
- This might be simulated data due to rate limits
- Add `GITHUB_TOKEN` to `.env` for real data
- Check browser console for API errors

### Chrome Extension Issues

**Extension not working**
- Verify `API_BASE` URLs in `popup.js` and `content.js`
- Check if backend is deployed and accessible
- Open extension popup → Right-click → Inspect → Check console errors
- Ensure manifest.json has correct permissions

### Deployment Issues

**Build fails**
```bash
# Clear Motia cache
rm -rf .motia
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
# Try again
npx motia cloud deploy --api-key <key> --version-name v1.0.0
```

**Environment variables not working in production**
- Ensure you used `--env-file .env.production` flag
- Or set them in Motia Cloud dashboard under Environment Variables
- Check variable names are exact (e.g., `GITHUB_TOKEN`, not `GITHUB_ACCESS_TOKEN`)

**Embed charts return 403**
- GitHub token not set in production
- Re-deploy with `--env-file` flag
- Verify token in Motia Cloud dashboard

### Getting Help

If you're still stuck:
1. Check [Motia Documentation](https://www.motia.dev/docs)
2. Search [Motia GitHub Issues](https://github.com/MotiaDev/motia/issues)
3. Ask in [Motia Discord](https://discord.gg/motia)
4. Open an issue in this repository

## Learn More

### Motia Framework Documentation

- 📖 [Motia Documentation](https://www.motia.dev/docs)
- 🚀 [Quick Start Guide](https://www.motia.dev/docs/getting-started/quick-start)
- 🌊 [Real-time Streams](https://www.motia.dev/docs/advanced/streams)
- ☁️ [Deployment Guide](https://www.motia.dev/docs/deployment-guide/motia-cloud/deployment)

### Community & Support

- 💬 [Discord Community](https://discord.gg/motia)
- 🐙 [Motia GitHub](https://github.com/MotiaDev/motia)
- 📺 [Video Tutorials](https://www.motia.dev/docs/video-showcase)
- 📝 [Example Projects](https://www.motia.dev/docs/examples)

### Related Projects

- [star-history/star-history](https://github.com/star-history/star-history) - Inspiration for star history charts
- [MotiaDev/github-stars-counter](https://github.com/MotiaDev/github-stars-counter) - Real-time star tracking example

## Frequently Asked Questions

**Q: Do I need to deploy to use GitGalaxy?**  
A: No! You can run it locally. Deployment is only needed for the Chrome extension and embeddable charts.

**Q: Why does it show "simulated" data for star history?**  
A: When GitHub API rate limits are hit or for very new repos, we generate realistic growth curves. Use a GitHub token to get real data.

**Q: Can I track private repositories?**  
A: Yes, if you provide a GitHub token with appropriate permissions. Note that embed charts for private repos will only work for authorized users.

**Q: How often does live updates poll GitHub?**  
A: Every 30 seconds via the Cron Step. You can adjust this in `src/github/scheduled-poll.step.ts`.

**Q: Can I self-host without Motia Cloud?**  
A: Yes! Check [Self-Hosted Deployment](https://www.motia.dev/docs/deployment-guide/self-hosted-deployment) guide.

## License

MIT

---

<div align="center">
  
Built with ⚡ [Motia](https://motia.dev)

**If you find this useful, please ⭐ star the repo!**

</div>
