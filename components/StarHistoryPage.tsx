import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { RepoInfo } from '../types';
import { 
  Star, X, TrendingUp, Loader2, ExternalLink, Zap, Plus,
  Copy, Link2, Share2, Image as ImageIcon, FileText,
  Check, Sun, Moon
} from 'lucide-react';

interface StarHistoryPageProps {
  repoInfo: RepoInfo;
  onClose: () => void;
  token?: string;
}

interface StarDataPoint {
  date: string;
  stars: number;
}

interface RepoStarData {
  owner: string;
  repo: string;
  fullName: string;
  totalStars: number;
  history: StarDataPoint[];
  color: string;
}

// Color palette for multi-repo
const REPO_COLORS = [
  '#fbbf24', // amber (primary)
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#f472b6', // pink
  '#34d399', // emerald
  '#fb923c', // orange
  '#60a5fa', // blue
  '#f87171', // red
];

// Use relative URLs in production (goes through Vercel proxy)
const isProduction = import.meta.env.PROD;
const API_BASE = isProduction ? '' : 'http://localhost:3001';

const StarHistoryPage: React.FC<StarHistoryPageProps> = ({ repoInfo, onClose, token }) => {
  const [repos, setRepos] = useState<RepoStarData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRepoInput, setNewRepoInput] = useState('');
  
  // Chart options
  const [logScale, setLogScale] = useState(false);
  const [alignTimeline, setAlignTimeline] = useState(false);
  const [legendPosition, setLegendPosition] = useState<'top-left' | 'bottom-right'>('top-left');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  // Theme colors
  const colors = useMemo(() => ({
    bg: theme === 'dark' ? '#050810' : '#ffffff',
    cardBg: theme === 'dark' ? '#0d1424' : '#f8fafc',
    border: theme === 'dark' ? '#1e3a5f' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#1e293b',
    textMuted: theme === 'dark' ? '#64748b' : '#64748b',
    textSubtle: theme === 'dark' ? '#475569' : '#94a3b8',
    grid: theme === 'dark' ? '#1e3a5f' : '#e2e8f0',
    input: theme === 'dark' ? '#0d1424' : '#ffffff',
    inputBorder: theme === 'dark' ? '#1e3a5f' : '#cbd5e1',
    hover: theme === 'dark' ? '#1e3a5f' : '#f1f5f9',
    accent: '#00d4ff',
    success: '#22c55e',
    warning: '#fbbf24',
  }), [theme]);
  
  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Selected repo for history table (multi-repo mode)
  const [selectedRepoIndex, setSelectedRepoIndex] = useState(0);
  
  const chartRef = useRef<SVGSVGElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch star history for a repo
  const fetchRepoHistory = useCallback(async (owner: string, repo: string, colorIndex: number): Promise<RepoStarData | null> => {
    try {
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const response = await fetch(
        `${API_BASE}/api/github/stars/${owner}/${repo}${tokenParam}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch ${owner}/${repo}`);
      }

      const data = await response.json();
      return {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        totalStars: data.totalStars ?? 0,
        history: data.history,
        color: REPO_COLORS[colorIndex % REPO_COLORS.length],
      };
    } catch (err) {
      console.error(`Error fetching ${owner}/${repo}:`, err);
      return null;
    }
  }, [token]);

  // Load initial repo
  useEffect(() => {
    let isMounted = true;
    
    const loadInitialRepo = async () => {
      setLoading(true);
      setError(null);
      
      const data = await fetchRepoHistory(repoInfo.owner.login, repoInfo.name, 0);
      
      if (!isMounted) return;
      
      if (data) {
        setRepos([data]);
      } else {
        setError('Failed to load star history');
        // Fallback
        setRepos([{
          owner: repoInfo.owner.login,
          repo: repoInfo.name,
          fullName: `${repoInfo.owner.login}/${repoInfo.name}`,
          totalStars: repoInfo.stars ?? 0,
          history: [{ date: new Date().toISOString().split('T')[0], stars: repoInfo.stars ?? 0 }],
          color: REPO_COLORS[0],
        }]);
      }
      setLoading(false);
    };

    loadInitialRepo();
    
    return () => { isMounted = false; };
  }, [repoInfo.owner.login, repoInfo.name, repoInfo.stars, fetchRepoHistory]);

  // Add new repo
  const handleAddRepo = async () => {
    const input = newRepoInput.trim();
    if (!input) return;
    
    // Parse owner/repo
    const match = input.match(/^(?:https?:\/\/github\.com\/)?([^\/]+)\/([^\/\s]+)/);
    if (!match) {
      setError('Invalid format. Use: owner/repo or GitHub URL');
      return;
    }
    
    const [, owner, repo] = match;
    const fullName = `${owner}/${repo}`;
    
    // Check if already added
    if (repos.some(r => r.fullName.toLowerCase() === fullName.toLowerCase())) {
      setError('Repository already added');
      return;
    }
    
    setLoadingRepo(fullName);
    setError(null);
    
    const data = await fetchRepoHistory(owner, repo, repos.length);
    
    if (data) {
      setRepos(prev => [...prev, data]);
      setNewRepoInput('');
    } else {
      setError(`Could not find ${fullName}`);
    }
    
    setLoadingRepo(null);
  };

  // Remove repo
  const handleRemoveRepo = (fullName: string) => {
    setRepos(prev => {
      const newRepos = prev.filter(r => r.fullName !== fullName);
      // Reset selected index if it's out of bounds
      if (selectedRepoIndex >= newRepos.length) {
        setSelectedRepoIndex(Math.max(0, newRepos.length - 1));
      }
      return newRepos;
    });
  };

  // Clear all repos
  const handleClearAll = () => {
    if (repos.length > 1) {
      setRepos(prev => [prev[0]]); // Keep the first one
      setSelectedRepoIndex(0); // Reset selection
    }
  };

  // Chart calculations
  const chart = useMemo(() => {
    if (!repos.length || repos.every(r => r.history.length < 2)) return null;

    const width = 800;
    const height = 400;
    const padding = { top: 40, right: 80, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find global date range and max stars
    let allDates: number[] = [];
    let maxStars = 0;
    
    repos.forEach(repo => {
      repo.history.forEach(d => {
        allDates.push(new Date(d.date).getTime());
        maxStars = Math.max(maxStars, d.stars);
      });
    });

    const minDate = Math.min(...allDates);
    const maxDate = Math.max(...allDates);

    // Scale functions
    const xScale = (date: string, repoMinDate?: number) => {
      const t = new Date(date).getTime();
      if (alignTimeline && repoMinDate !== undefined) {
        // Align by relative time from each repo's start
        const repoHistory = repos.find(r => r.history.some(h => new Date(h.date).getTime() === repoMinDate))?.history;
        if (repoHistory) {
          const repoMaxDate = new Date(repoHistory[repoHistory.length - 1].date).getTime();
          const relativeT = (t - repoMinDate) / (repoMaxDate - repoMinDate || 1);
          return padding.left + relativeT * chartWidth;
        }
      }
      return padding.left + ((t - minDate) / (maxDate - minDate || 1)) * chartWidth;
    };

    const yScale = (stars: number) => {
      if (logScale && stars > 0) {
        const logMax = Math.log10(maxStars);
        const logVal = Math.log10(Math.max(1, stars));
        return padding.top + chartHeight - (logVal / logMax) * chartHeight;
      }
      return padding.top + chartHeight - (stars / (maxStars || 1)) * chartHeight;
    };

    // Generate paths for each repo
    const repoPaths = repos.map(repo => {
      const repoMinDate = new Date(repo.history[0].date).getTime();
      const pathPoints = repo.history.map(d => ({ 
        x: xScale(d.date, repoMinDate), 
        y: yScale(d.stars),
        date: d.date,
        stars: d.stars
      }));
      const linePath = `M ${pathPoints.map(p => `${p.x},${p.y}`).join(' L ')}`;
      return { ...repo, pathPoints, linePath };
    });

    // Y-axis labels
    const yLabels: { stars: number; y: number; label: string }[] = [];
    
    if (logScale && maxStars > 0) {
      // Use nice powers of 10 for log scale: 1, 10, 100, 1K, 10K, 100K, etc.
      const maxPower = Math.ceil(Math.log10(maxStars));
      for (let power = 0; power <= maxPower; power++) {
        const stars = Math.pow(10, power);
        if (stars <= maxStars * 1.1) { // Include values up to max
          let label: string;
          if (stars >= 1000000) label = `${stars / 1000000}M`;
          else if (stars >= 1000) label = `${stars / 1000}K`;
          else label = stars.toString();
          
          yLabels.push({
            stars,
            y: yScale(stars),
            label,
          });
        }
      }
      // Add the max value if it's significantly different from last power
      if (maxStars > Math.pow(10, maxPower - 1) * 1.5) {
        const maxLabel = maxStars >= 1000 
          ? `${(maxStars / 1000).toFixed(maxStars >= 10000 ? 0 : 1)}K`
          : maxStars.toString();
        yLabels.push({ stars: maxStars, y: yScale(maxStars), label: maxLabel });
      }
    } else {
      // Linear scale - use nice round numbers
      const ySteps = 5;
      for (let i = 0; i <= ySteps; i++) {
        const stars = Math.round((maxStars / ySteps) * i);
        yLabels.push({
          stars,
          y: yScale(stars),
          label: stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}K` : stars.toString(),
        });
      }
    }

    // X-axis labels
    const uniqueDates = [...new Set(allDates)].sort((a, b) => a - b);
    const xSteps = Math.min(7, uniqueDates.length);
    const xLabels = Array.from({ length: xSteps }).map((_, i) => {
      const index = Math.floor((uniqueDates.length - 1) * (i / (xSteps - 1)));
      const timestamp = uniqueDates[index];
      const date = new Date(timestamp);
      return {
        x: padding.left + ((timestamp - minDate) / (maxDate - minDate || 1)) * chartWidth,
        label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
    });

    return { width, height, repoPaths, yLabels, xLabels, padding, chartWidth, chartHeight, maxStars };
  }, [repos, logScale, alignTimeline]);

  // Export functions
  const getEmbedCode = () => {
    const repoParams = repos.map(r => r.fullName).join(',');
    return `[![Star History Chart](https://git-history.com/api/embed/stars?repos=${repoParams}&theme=${theme})](https://git-history.com)`;
  };

  const getShareLink = () => {
    const repoParams = repos.map(r => r.fullName).join(',');
    return `https://git-history.com?repos=${repoParams}`;
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadCSV = () => {
    if (!repos.length) return;
    
    // Create CSV with all repos' data
    let csv = 'Date,' + repos.map(r => r.fullName).join(',') + '\n';
    
    // Get all unique dates
    const allDates = new Set<string>();
    repos.forEach(r => r.history.forEach(h => allDates.add(h.date)));
    const sortedDates = [...allDates].sort();
    
    // Build CSV rows
    sortedDates.forEach(date => {
      const values = repos.map(r => {
        const point = r.history.find(h => h.date === date);
        return point ? point.stars : '';
      });
      csv += `${date},${values.join(',')}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `star-history-${repos.map(r => r.repo).join('-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadImage = async () => {
    if (!chartRef.current) return;
    
    // Clone SVG and add background
    const svgClone = chartRef.current.cloneNode(true) as SVGSVGElement;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', colors.cardBg);
    svgClone.insertBefore(bg, svgClone.firstChild);
    
    // Convert to blob
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // Download
    const a = document.createElement('a');
    a.href = url;
    a.download = `star-history-${repos.map(r => r.repo).join('-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareOnTwitter = () => {
    const repoNames = repos.map(r => r.fullName).join(', ');
    const totalStars = repos.reduce((sum, r) => sum + r.totalStars, 0);
    const text = `📊 Star history for ${repoNames}\n\n⭐ ${totalStars.toLocaleString()} total stars\n\nTrack your repo's star history at`;
    const url = getShareLink();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-auto transition-colors"
      style={{ backgroundColor: colors.bg }}
    >
      {/* Header */}
      <div 
        className="sticky top-0 backdrop-blur border-b p-3 sm:p-4 flex items-center justify-between gap-2 transition-colors"
        style={{ 
          backgroundColor: theme === 'dark' ? 'rgba(5, 8, 16, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: colors.border 
        }}
      >
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] flex items-center justify-center flex-shrink-0">
            <Star className="text-[#0d1424]" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 
              className="text-sm sm:text-xl font-bold flex items-center gap-1 sm:gap-2"
              style={{ color: colors.text }}
            >
              <span>Star History</span>
            </h1>
            <p className="text-xs sm:text-sm hidden sm:block" style={{ color: colors.textMuted }}>Powered by Motia</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded transition-colors"
            style={{ 
              backgroundColor: theme === 'dark' ? colors.hover : colors.cardBg,
              color: colors.textMuted
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {repos.length === 1 && (
            <a
              href={`https://github.com/${repos[0].fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors"
              style={{ 
                backgroundColor: colors.hover,
                color: colors.accent
              }}
            >
              <ExternalLink size={14} />
              View on GitHub
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded transition-colors"
            style={{ color: colors.textMuted }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        {/* Add Repo Input */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={newRepoInput}
                onChange={(e) => setNewRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
                placeholder="...add next repository (e.g., facebook/react)"
                className="w-full px-4 py-3 rounded-lg font-mono text-sm transition-colors focus:outline-none"
                style={{ 
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: colors.inputBorder,
                  color: colors.text
                }}
              />
              {loadingRepo && (
                <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: colors.accent }} />
              )}
            </div>
            <button
              onClick={handleAddRepo}
              disabled={!newRepoInput.trim() || !!loadingRepo}
              className="px-6 py-3 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              style={{
                backgroundColor: !newRepoInput.trim() || !!loadingRepo ? colors.hover : colors.accent,
                color: !newRepoInput.trim() || !!loadingRepo ? colors.textMuted : '#0d1424'
              }}
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>

          {/* Selected Repos */}
          {repos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {repos.map((repo) => (
                <div
                  key={repo.fullName}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors"
                  style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
                >
                  <span 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: repo.color }}
                  />
                  <span className="font-mono" style={{ color: colors.text }}>{repo.fullName}</span>
                  <a
                    href={`https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: colors.textMuted }}
                  >
                    <ExternalLink size={12} />
                  </a>
                  {repos.length > 1 && (
                    <button
                      onClick={() => handleRemoveRepo(repo.fullName)}
                      className="ml-1 hover:text-[#ef4444]"
                      style={{ color: colors.textMuted }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {repos.length > 1 && (
                <button
                  onClick={handleClearAll}
                  className="text-sm transition-colors"
                  style={{ color: colors.textMuted }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-[#ef4444] text-sm mt-2">{error}</p>
          )}
        </div>

        {/* Chart Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMuted }}>
              <input
                type="checkbox"
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
                className="w-4 h-4 rounded border-[#1e3a5f] bg-[#0d1424] text-[#00d4ff] focus:ring-[#00d4ff] cursor-pointer"
              />
              Log scale
            </label>
            {repos.length > 1 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMuted }}>
                <input
                  type="checkbox"
                  checked={alignTimeline}
                  onChange={(e) => setAlignTimeline(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                Align timeline
              </label>
            )}
            <div className="flex items-center gap-2 text-sm" style={{ color: colors.textMuted }}>
              <span>Legend</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="legend"
                  checked={legendPosition === 'top-left'}
                  onChange={() => setLegendPosition('top-left')}
                  className="w-3 h-3"
                />
                <span className="text-xs">Top left</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="legend"
                  checked={legendPosition === 'bottom-right'}
                  onChange={() => setLegendPosition('bottom-right')}
                  className="w-3 h-3"
                />
                <span className="text-xs">Bottom right</span>
              </label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-96">
            <Loader2 size={48} className="animate-spin mb-4" style={{ color: colors.accent }} />
            <p style={{ color: colors.textMuted }}>Loading star history...</p>
          </div>
        ) : repos.length > 0 && (
          <>
            {/* Chart */}
            {chart && (
              <div 
                className="rounded-xl p-4 sm:p-6 mb-6 relative transition-colors"
                style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
              >
                {/* Legend */}
                <div 
                  className={`absolute z-10 rounded-lg px-3 py-2 ${
                    legendPosition === 'top-left' ? 'top-4 left-4' : 'bottom-16 right-4'
                  }`}
                  style={{ 
                    backgroundColor: theme === 'dark' ? 'rgba(13, 20, 36, 0.9)' : 'rgba(248, 250, 252, 0.9)',
                    borderWidth: 1, 
                    borderStyle: 'solid', 
                    borderColor: colors.border 
                  }}
                >
                  {repos.map(repo => (
                    <div key={repo.fullName} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: repo.color }} />
                      <span className="font-mono" style={{ color: colors.text }}>{repo.fullName}</span>
                    </div>
                  ))}
                </div>

                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: colors.text }}>
                  <Star className="text-[#fbbf24]" size={18} />
                  Star History
                </h2>
                <svg
                  ref={chartRef}
                  width="100%"
                  height={chart.height}
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  className="overflow-visible"
                >
                  {/* Grid lines */}
                  {chart.yLabels.map((label, i) => (
                    <g key={i}>
                      <line
                        x1={chart.padding.left}
                        y1={label.y}
                        x2={chart.width - chart.padding.right}
                        y2={label.y}
                        stroke={colors.grid}
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                      <text
                        x={chart.padding.left - 12}
                        y={label.y + 4}
                        textAnchor="end"
                        fontSize="12"
                        fill={colors.textMuted}
                        fontFamily="ui-monospace, monospace"
                      >
                        {label.label}
                      </text>
                    </g>
                  ))}

                  {/* X-axis labels */}
                  {chart.xLabels.map((label, i) => (
                    <text
                      key={i}
                      x={label.x}
                      y={chart.height - chart.padding.bottom + 24}
                      textAnchor="middle"
                      fontSize="11"
                      fill={colors.textMuted}
                      fontFamily="ui-monospace, monospace"
                    >
                      {label.label}
                    </text>
                  ))}

                  {/* Gradient definitions */}
                  <defs>
                    {chart.repoPaths.map((repo, i) => (
                      <linearGradient key={i} id={`gradient-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={repo.color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={repo.color} stopOpacity="0.02" />
                      </linearGradient>
                    ))}
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Render each repo's line */}
                  {chart.repoPaths.map((repo, repoIndex) => (
                    <g key={repo.fullName}>
                      {/* Area fill (only for single repo) */}
                      {repos.length === 1 && (
                        <path
                          d={`${repo.linePath} L ${repo.pathPoints[repo.pathPoints.length - 1].x},${chart.height - chart.padding.bottom} L ${repo.pathPoints[0].x},${chart.height - chart.padding.bottom} Z`}
                          fill={`url(#gradient-${repoIndex})`}
                        />
                      )}

                      {/* Line */}
                      <path
                        d={repo.linePath}
                        fill="none"
                        stroke={repo.color}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#glow)"
                      />

                      {/* Data points */}
                      {repo.pathPoints.map((point, i) => (
                        <g key={i}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="5"
                            fill={colors.cardBg}
                            stroke={repo.color}
                            strokeWidth="2"
                            className="hover:r-7 transition-all cursor-pointer"
                          />
                          <title>
                            {repo.fullName}
                            {'\n'}{point.date}: {point.stars.toLocaleString()} stars
                          </title>
                        </g>
                      ))}

                      {/* End point indicator */}
                      {repo.pathPoints.length > 0 && (
                        <g>
                          <circle
                            cx={repo.pathPoints[repo.pathPoints.length - 1].x}
                            cy={repo.pathPoints[repo.pathPoints.length - 1].y}
                            r="8"
                            fill={repo.color}
                            className="animate-pulse"
                          />
                          <text
                            x={repo.pathPoints[repo.pathPoints.length - 1].x + 14}
                            y={repo.pathPoints[repo.pathPoints.length - 1].y + 4}
                            fontSize="12"
                            fontWeight="bold"
                            fill={repo.color}
                            fontFamily="ui-monospace, monospace"
                          >
                            {repo.totalStars.toLocaleString()}
                          </text>
                        </g>
                      )}
                    </g>
                  ))}

                  {/* Axis labels */}
                  <text
                    x={chart.padding.left - 50}
                    y={chart.height / 2}
                    textAnchor="middle"
                    fontSize="12"
                    fill={colors.textSubtle}
                    transform={`rotate(-90, ${chart.padding.left - 50}, ${chart.height / 2})`}
                  >
                    GitHub Stars
                  </text>
                  <text
                    x={chart.width / 2}
                    y={chart.height - 10}
                    textAnchor="middle"
                    fontSize="12"
                    fill={colors.textSubtle}
                  >
                    Date
                  </text>

                  {/* Watermark */}
                  <text
                    x={chart.width - chart.padding.right}
                    y={chart.height - chart.padding.bottom - 10}
                    textAnchor="end"
                    fontSize="10"
                    fill={colors.textSubtle}
                    fontFamily="ui-monospace, monospace"
                  >
                    ⭐ git-history.com
                  </text>
                </svg>
              </div>
            )}

            {/* Export Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={downloadImage}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border, color: colors.text }}
                >
                  <ImageIcon size={16} />
                  Image
                </button>
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border, color: colors.text }}
                >
                  <FileText size={16} />
                  CSV
                </button>
                <button
                  onClick={() => copyToClipboard(getEmbedCode(), 'embed')}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border, color: colors.text }}
                >
                  {copied === 'embed' ? <Check size={16} className="text-[#22c55e]" /> : <Copy size={16} />}
                  Embed
                </button>
                <button
                  onClick={() => copyToClipboard(getShareLink(), 'link')}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border, color: colors.text }}
                >
                  {copied === 'link' ? <Check size={16} className="text-[#22c55e]" /> : <Link2 size={16} />}
                  Link
                </button>
                <button
                  onClick={shareOnTwitter}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-sm rounded-lg transition-colors"
                >
                  <Share2 size={16} />
                  Share on Twitter
                </button>
              </div>
            </div>

            {/* Embed Code Preview */}
            <div 
              className="rounded-xl p-4 mb-8 transition-colors"
              style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
            >
              <p className="text-sm mb-3" style={{ color: colors.textMuted }}>
                🌟 Show real-time chart on your{' '}
                <a href="https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes" className="hover:underline" style={{ color: colors.accent }} target="_blank" rel="noopener noreferrer">README.md</a>
                {' '}with the following code:
              </p>
              <div 
                className="rounded-lg p-4 font-mono text-sm overflow-x-auto"
                style={{ backgroundColor: colors.bg, color: colors.textMuted }}
              >
                <code>## Star History</code>
                <br /><br />
                <code className="text-[#22c55e]">{getEmbedCode()}</code>
              </div>
              <button
                onClick={() => copyToClipboard(`## Star History\n\n${getEmbedCode()}`, 'readme')}
                className="mt-4 w-full sm:w-auto px-6 py-3 bg-[#fbbf24] hover:bg-[#f59e0b] text-[#0d1424] font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {copied === 'readme' ? <Check size={18} /> : <Copy size={18} />}
                Copy to GitHub README.md
              </button>
              <span className="text-xs ml-4" style={{ color: colors.textMuted }}>({theme} theme supported)</span>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
              <div 
                className="rounded-xl p-6 transition-colors"
                style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Star className="text-[#fbbf24] fill-[#fbbf24]" size={24} />
                  <span className="text-3xl font-bold tabular-nums" style={{ color: colors.text }}>
                    {repos.reduce((sum, r) => sum + r.totalStars, 0).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm" style={{ color: colors.textMuted }}>{repos.length > 1 ? 'Combined Stars' : 'Total Stars'}</p>
              </div>
              <div 
                className="rounded-xl p-6 transition-colors"
                style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="text-[#22c55e]" size={24} />
                  <span className="text-3xl font-bold tabular-nums" style={{ color: colors.text }}>
                    {(() => {
                      // Calculate combined average growth across all repos
                      let totalGrowth = 0;
                      let totalPeriods = 0;
                      repos.forEach(r => {
                        if (r.history.length > 1) {
                          totalGrowth += r.history[r.history.length - 1].stars - r.history[0].stars;
                          totalPeriods += r.history.length - 1;
                        }
                      });
                      return totalPeriods > 0 ? `+${Math.round(totalGrowth / totalPeriods).toLocaleString()}` : '—';
                    })()}
                  </span>
                </div>
                <p className="text-sm" style={{ color: colors.textMuted }}>{repos.length > 1 ? 'Avg Growth/Period (All)' : 'Avg Growth/Period'}</p>
              </div>
              <div 
                className="rounded-xl p-6 transition-colors"
                style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Zap style={{ color: colors.accent }} size={24} />
                  <span className="text-lg font-bold" style={{ color: colors.text }}>
                    {repos.length}
                  </span>
                </div>
                <p className="text-sm" style={{ color: colors.textMuted }}>Repositories</p>
              </div>
            </div>

            {/* History Table with repo selector for multi-repo */}
            {repos.length > 0 && repos.some(r => r.history.length > 1) && (
              <div 
                className="rounded-xl overflow-hidden transition-colors"
                style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.border }}
              >
                <div className="p-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: colors.border }}>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text }}>History Data</h2>
                  {repos.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {repos.map((repo, idx) => (
                        <button
                          key={repo.fullName}
                          onClick={() => setSelectedRepoIndex(idx)}
                          className="px-3 py-1 text-sm rounded-full font-mono transition-colors"
                          style={{
                            backgroundColor: selectedRepoIndex === idx ? repo.color : 'transparent',
                            color: selectedRepoIndex === idx ? '#0d1424' : colors.textMuted,
                            borderWidth: 1,
                            borderStyle: 'solid',
                            borderColor: repo.color
                          }}
                        >
                          {repo.repo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {repos[selectedRepoIndex] && repos[selectedRepoIndex].history.length > 1 && (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full">
                      <thead style={{ backgroundColor: colors.bg }} className="sticky top-0">
                        <tr>
                          <th className="text-left p-3 text-xs font-medium" style={{ color: colors.textMuted }}>Date</th>
                          <th className="text-right p-3 text-xs font-medium" style={{ color: colors.textMuted }}>Stars</th>
                          <th className="text-right p-3 text-xs font-medium" style={{ color: colors.textMuted }}>Growth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...repos[selectedRepoIndex].history].reverse().map((point, i, arr) => {
                          const prevStars = arr[i + 1]?.stars || 0;
                          const growth = point.stars - prevStars;
                          return (
                            <tr 
                              key={i} 
                              className="transition-colors"
                              style={{ borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: `${colors.border}50` }}
                            >
                              <td className="p-3 text-sm font-mono" style={{ color: colors.text }}>
                                {new Date(point.date).toLocaleDateString()}
                              </td>
                              <td className="p-3 text-sm text-right font-mono" style={{ color: repos[selectedRepoIndex].color }}>
                                {point.stars.toLocaleString()}
                              </td>
                              <td className="p-3 text-sm text-right font-mono">
                                {growth > 0 && (
                                  <span className="text-[#22c55e]">+{growth.toLocaleString()}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 text-center text-sm" style={{ color: colors.textSubtle }}>
              <p>
                Powered by{' '}
                <a
                  href="https://motia.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline font-medium"
                  style={{ color: colors.accent }}
                >
                  Motia
                </a>
                {' '}· Open Source Backend Framework
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StarHistoryPage;
