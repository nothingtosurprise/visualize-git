// API Base URL - Loaded from config.js (included in manifest.json)

// Get stored token
async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['githubToken'], (result) => {
      resolve(result.githubToken || '');
    });
  });
}

// Save token
async function saveToken(token) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ githubToken: token }, resolve);
  });
}

// Parse GitHub URL to get owner/repo
function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }
  return null;
}

// Fetch star history from Motia API
async function fetchStarHistory(owner, repo, token) {
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  const response = await fetch(`${API_BASE}/api/github/stars/${owner}/${repo}${tokenParam}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch star history');
  }
  
  return response.json();
}

// Fetch repo details from Motia API
async function fetchRepoDetails(owner, repo, token) {
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  const response = await fetch(`${API_BASE}/api/github/repo/${owner}/${repo}${tokenParam}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch repo details');
  }
  
  return response.json();
}

// Generate simulated history if API fails
function generateSimulatedHistory(totalStars) {
  const points = [];
  const now = new Date();
  const yearsAgo = Math.min(5, Math.max(1, Math.floor(Math.log10(totalStars + 1))));
  
  for (let i = 0; i <= 11; i++) {
    const monthsAgo = (11 - i) * (yearsAgo * 12 / 11);
    const date = new Date(now);
    date.setMonth(date.getMonth() - Math.floor(monthsAgo));
    
    const progress = i / 11;
    const growthFactor = Math.pow(progress, 1.5);
    const stars = Math.round(totalStars * growthFactor);
    
    points.push({
      date: date.toISOString().split('T')[0],
      stars: Math.max(1, stars),
    });
  }
  
  return points;
}

// Render star chart
function renderChart(history, totalStars) {
  const width = 340;
  const height = 140;
  const padding = { top: 20, right: 40, bottom: 30, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxStars = Math.max(...history.map(d => d.stars));
  const dates = history.map(d => new Date(d.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  
  const xScale = (date) => {
    const t = new Date(date).getTime();
    return padding.left + ((t - minDate) / (maxDate - minDate || 1)) * chartWidth;
  };
  
  const yScale = (stars) => {
    return padding.top + chartHeight - (stars / (maxStars || 1)) * chartHeight;
  };
  
  const pathPoints = history.map(d => ({ x: xScale(d.date), y: yScale(d.stars) }));
  const linePath = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L ${pathPoints[pathPoints.length - 1].x},${height - padding.bottom} L ${pathPoints[0].x},${height - padding.bottom} Z`;
  
  const startYear = new Date(history[0].date).getFullYear();
  const endYear = new Date(history[history.length - 1].date).getFullYear();
  
  return `
    <svg width="${width}" height="${height}" style="display: block;">
      <defs>
        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      
      <!-- Grid lines -->
      <line x1="${padding.left}" y1="${yScale(maxStars)}" x2="${width - padding.right}" y2="${yScale(maxStars)}" 
            stroke="#1e3a5f" stroke-width="1" stroke-dasharray="4,4"/>
      <line x1="${padding.left}" y1="${yScale(0)}" x2="${width - padding.right}" y2="${yScale(0)}" 
            stroke="#1e3a5f" stroke-width="1"/>
      
      <!-- Area fill -->
      <path d="${areaPath}" fill="url(#chartGradient)"/>
      
      <!-- Line -->
      <path d="${linePath}" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      
      <!-- End point -->
      <circle cx="${pathPoints[pathPoints.length - 1].x}" cy="${pathPoints[pathPoints.length - 1].y}" 
              r="5" fill="#fbbf24"/>
      
      <!-- Y-axis labels -->
      <text x="${padding.left - 8}" y="${yScale(maxStars) + 4}" text-anchor="end" 
            font-size="10" fill="#64748b" font-family="monospace">
        ${maxStars >= 1000 ? (maxStars / 1000).toFixed(0) + 'k' : maxStars}
      </text>
      <text x="${padding.left - 8}" y="${yScale(0) + 4}" text-anchor="end" 
            font-size="10" fill="#64748b" font-family="monospace">0</text>
      
      <!-- X-axis labels -->
      <text x="${padding.left}" y="${height - 8}" text-anchor="start" 
            font-size="9" fill="#475569" font-family="monospace">${startYear}</text>
      <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" 
            font-size="9" fill="#475569" font-family="monospace">${endYear}</text>
      
      <!-- Current stars label -->
      <text x="${pathPoints[pathPoints.length - 1].x + 8}" y="${pathPoints[pathPoints.length - 1].y + 4}" 
            font-size="11" font-weight="bold" fill="#fbbf24" font-family="monospace">
        ${totalStars.toLocaleString()}
      </text>
    </svg>
  `;
}

// Render settings view
function renderSettings(token) {
  return `
    <div class="repo-info">
      <div class="repo-name">⚙️ Settings</div>
      <div class="repo-desc">Add your GitHub token to increase API rate limits</div>
      <input type="password" id="token-input" class="token-input" 
             placeholder="ghp_xxxxxxxxxxxx" value="${token}">
      <button id="save-token" class="save-btn">Save Token</button>
    </div>
    <div style="font-size: 11px; color: #64748b; line-height: 1.5;">
      <p><strong>Why add a token?</strong></p>
      <p style="margin-top: 4px;">GitHub API has rate limits. With a token, you get 5,000 requests/hour instead of 60.</p>
      <p style="margin-top: 8px;"><a href="https://github.com/settings/tokens" target="_blank" style="color: #00d4ff;">Create a token →</a></p>
    </div>
  `;
}

// Main popup logic
async function init() {
  const content = document.getElementById('content');
  let showSettings = false;
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const repoInfo = parseGitHubUrl(tab.url);
  const token = await getToken();
  
  if (!repoInfo) {
    content.innerHTML = `
      <div class="not-repo">
        <div class="not-repo-title">Not a GitHub Repository</div>
        <p>Navigate to a GitHub repository to see its star history.</p>
      </div>
    `;
    return;
  }
  
  // Show loading
  content.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading ${repoInfo.owner}/${repoInfo.repo}...</span>
    </div>
  `;
  
  try {
    // Fetch data
    const [starData, repoData] = await Promise.all([
      fetchStarHistory(repoInfo.owner, repoInfo.repo, token).catch(() => null),
      fetchRepoDetails(repoInfo.owner, repoInfo.repo, token).catch(() => null),
    ]);
    
    let history = starData?.history || [];
    const totalStars = repoData?.stargazers_count || starData?.totalStars || 0;
    
    // Generate simulated history if needed
    if (history.length < 2 && totalStars > 0) {
      history = generateSimulatedHistory(totalStars);
    }
    
    // Render content
    content.innerHTML = `
      <div class="repo-info">
        <div class="repo-name">${repoInfo.owner}/${repoInfo.repo}</div>
        <div class="repo-desc">${repoData?.description || 'No description'}</div>
        <div class="stats">
          <div class="stat">
            <span class="stat-icon">⭐</span>
            <span>${totalStars.toLocaleString()} stars</span>
          </div>
          ${repoData?.forks_count ? `
          <div class="stat">
            <span>🔱</span>
            <span>${repoData.forks_count.toLocaleString()} forks</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      <div class="chart-container">
        <div class="chart-title">
          📈 Star History
          ${history.length > 2 ? '' : '<span style="color: #fbbf24; font-size: 10px;">(simulated)</span>'}
        </div>
        ${history.length >= 2 ? renderChart(history, totalStars) : '<div class="loading"><span>No data available</span></div>'}
      </div>
    `;
    
  } catch (error) {
    content.innerHTML = `
      <div class="error">
        <p>Failed to load data</p>
        <p style="font-size: 11px; margin-top: 8px; color: #64748b;">${error.message}</p>
      </div>
    `;
  }
  
  // Add settings toggle
  const footer = document.querySelector('.footer');
  const settingsLink = document.createElement('div');
  settingsLink.className = 'settings-link';
  settingsLink.textContent = '⚙️ Settings';
  settingsLink.onclick = async () => {
    const token = await getToken();
    content.innerHTML = renderSettings(token);
    
    document.getElementById('save-token').onclick = async () => {
      const newToken = document.getElementById('token-input').value;
      await saveToken(newToken);
      init(); // Refresh
    };
  };
  footer.insertAdjacentElement('beforebegin', settingsLink);
}

// Initialize popup
init();

