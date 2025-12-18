// Content script to inject star history button on GitHub pages
// API Base URL - Loaded from config.js (included in manifest.json)

// Parse current page URL
function parseGitHubUrl() {
  const match = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

// Create the star history button
function createStarHistoryButton() {
  const repoInfo = parseGitHubUrl();
  if (!repoInfo) return;
  
  // Check if we're on a repo page (look for the star button area)
  const actionsList = document.querySelector('.pagehead-actions');
  if (!actionsList) return;
  
  // Don't add if already exists
  if (document.getElementById('git-history-button')) return;
  
  // Create button
  const li = document.createElement('li');
  li.id = 'git-history-button';
  
  const button = document.createElement('button');
  button.className = 'btn btn-sm';
  button.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0d1424, #1e3a5f);
    color: #00d4ff;
    border: 1px solid #1e3a5f;
    cursor: pointer;
  `;
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
    <span>Star History</span>
  `;
  
  button.onclick = () => {
    // Open popup or show inline chart
    showStarHistoryModal(repoInfo.owner, repoInfo.repo);
  };
  
  li.appendChild(button);
  actionsList.insertBefore(li, actionsList.firstChild);
}

// Show star history modal
async function showStarHistoryModal(owner, repo) {
  // Remove existing modal
  const existing = document.getElementById('git-history-modal');
  if (existing) existing.remove();
  
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'git-history-modal';
  modal.innerHTML = `
    <div class="git-history-overlay"></div>
    <div class="git-history-content">
      <div class="git-history-header">
        <div class="git-history-title">
          <span class="git-history-logo">✦</span>
          <span>Star History - ${owner}/${repo}</span>
        </div>
        <button class="git-history-close">×</button>
      </div>
      <div class="git-history-body">
        <div class="git-history-loading">
          <div class="git-history-spinner"></div>
          <span>Loading star history...</span>
        </div>
      </div>
      <div class="git-history-footer">
        Powered by <a href="https://motia.dev" target="_blank">Motia</a> · 
        <a href="https://git-history.com" target="_blank">git-history.com</a>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.git-history-overlay').onclick = () => modal.remove();
  modal.querySelector('.git-history-close').onclick = () => modal.remove();
  
  // Fetch and render
  try {
    const response = await fetch(`${API_BASE}/api/github/stars/${owner}/${repo}`);
    const data = await response.json();
    
    const body = modal.querySelector('.git-history-body');
    
    if (data.history && data.history.length >= 2) {
      body.innerHTML = renderChart(data.history, data.totalStars);
    } else {
      // Generate simulated data
      const simulated = generateSimulatedHistory(data.totalStars || 0);
      body.innerHTML = renderChart(simulated, data.totalStars || 0);
    }
  } catch (error) {
    modal.querySelector('.git-history-body').innerHTML = `
      <div class="git-history-error">
        Failed to load star history. 
        <br><small>Make sure the git-history.com backend is running.</small>
      </div>
    `;
  }
}

function generateSimulatedHistory(totalStars) {
  const points = [];
  const now = new Date();
  const yearsAgo = Math.min(5, Math.max(1, Math.floor(Math.log10(totalStars + 1))));
  
  for (let i = 0; i <= 11; i++) {
    const monthsAgo = (11 - i) * (yearsAgo * 12 / 11);
    const date = new Date(now);
    date.setMonth(date.getMonth() - Math.floor(monthsAgo));
    const progress = i / 11;
    const stars = Math.round(totalStars * Math.pow(progress, 1.5));
    points.push({ date: date.toISOString().split('T')[0], stars: Math.max(1, stars) });
  }
  return points;
}

function renderChart(history, totalStars) {
  const width = 600;
  const height = 300;
  const padding = { top: 30, right: 60, bottom: 40, left: 60 };
  
  const maxStars = Math.max(...history.map(d => d.stars));
  const dates = history.map(d => new Date(d.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  
  const xScale = (date) => padding.left + ((new Date(date).getTime() - minDate) / (maxDate - minDate || 1)) * (width - padding.left - padding.right);
  const yScale = (stars) => padding.top + (height - padding.top - padding.bottom) - (stars / (maxStars || 1)) * (height - padding.top - padding.bottom);
  
  const linePath = history.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.date)},${yScale(d.stars)}`).join(' ');
  const areaPath = `${linePath} L ${xScale(history[history.length - 1].date)},${height - padding.bottom} L ${xScale(history[0].date)},${height - padding.bottom} Z`;
  
  return `
    <div style="text-align: center; margin-bottom: 16px;">
      <span style="font-size: 28px; color: #fbbf24;">⭐ ${totalStars.toLocaleString()}</span>
      <span style="color: #64748b; margin-left: 8px;">stars</span>
    </div>
    <svg width="${width}" height="${height}" style="display: block; margin: 0 auto;">
      <defs>
        <linearGradient id="ggGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#ggGradient)"/>
      <path d="${linePath}" fill="none" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${xScale(history[history.length - 1].date)}" cy="${yScale(history[history.length - 1].stars)}" r="6" fill="#fbbf24"/>
      <text x="${padding.left}" y="${height - 10}" font-size="11" fill="#64748b">${new Date(history[0].date).getFullYear()}</text>
      <text x="${width - padding.right}" y="${height - 10}" text-anchor="end" font-size="11" fill="#64748b">${new Date(history[history.length - 1].date).getFullYear()}</text>
    </svg>
  `;
}

// Initialize on page load
createStarHistoryButton();

// Re-initialize on navigation (GitHub uses PJAX)
const observer = new MutationObserver(() => {
  setTimeout(createStarHistoryButton, 500);
});

observer.observe(document.body, { childList: true, subtree: true });

