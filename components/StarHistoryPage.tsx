import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { RepoInfo } from '../types';
import { 
  Star, X, TrendingUp, Loader2, ExternalLink, Zap, Plus, Trash2,
  Download, Copy, Link2, Share2, Image as ImageIcon, FileText,
  ChevronDown, Check
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
  
  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
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
    setRepos(prev => prev.filter(r => r.fullName !== fullName));
  };

  // Clear all repos
  const handleClearAll = () => {
    if (repos.length > 1) {
      setRepos(prev => [prev[0]]); // Keep the first one
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
    const ySteps = 5;
    const yLabels = Array.from({ length: ySteps + 1 }).map((_, i) => {
      let stars: number;
      if (logScale && maxStars > 0) {
        const logMax = Math.log10(maxStars);
        stars = Math.round(Math.pow(10, (logMax / ySteps) * i));
      } else {
        stars = Math.round((maxStars / ySteps) * i);
      }
      return {
        stars,
        y: yScale(stars),
        label: stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k` : stars.toString(),
      };
    });

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
    return `[![Star History Chart](https://git-history.com/api/embed/stars?repos=${repoParams}&theme=dark)](https://git-history.com)`;
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
    bg.setAttribute('fill', '#0d1424');
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
    <div className="fixed inset-0 z-50 bg-[#050810] overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-[#050810]/95 backdrop-blur border-b border-[#1e3a5f] p-3 sm:p-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] flex items-center justify-center flex-shrink-0">
            <Star className="text-[#0d1424]" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-xl font-bold text-white flex items-center gap-1 sm:gap-2">
              <span>Star History</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#64748b] hidden sm:block">Powered by Motia</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {repos.length === 1 && (
            <a
              href={`https://github.com/${repos[0].fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 px-3 py-2 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-[#00d4ff] text-sm rounded transition-colors"
            >
              <ExternalLink size={14} />
              View on GitHub
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#1e3a5f] rounded transition-colors text-[#64748b] hover:text-white"
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
                className="w-full px-4 py-3 bg-[#0d1424] border border-[#1e3a5f] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff] font-mono text-sm"
              />
              {loadingRepo && (
                <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00d4ff] animate-spin" />
              )}
            </div>
            <button
              onClick={handleAddRepo}
              disabled={!newRepoInput.trim() || !!loadingRepo}
              className="px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] disabled:bg-[#1e3a5f] disabled:text-[#64748b] text-[#0d1424] font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>

          {/* Selected Repos */}
          {repos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {repos.map((repo, i) => (
                <div
                  key={repo.fullName}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1424] border border-[#1e3a5f] rounded-full text-sm"
                >
                  <span 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: repo.color }}
                  />
                  <span className="text-white font-mono">{repo.fullName}</span>
                  <a
                    href={`https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#64748b] hover:text-[#00d4ff]"
                  >
                    <ExternalLink size={12} />
                  </a>
                  {repos.length > 1 && (
                    <button
                      onClick={() => handleRemoveRepo(repo.fullName)}
                      className="text-[#64748b] hover:text-[#ef4444] ml-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {repos.length > 1 && (
                <button
                  onClick={handleClearAll}
                  className="text-sm text-[#64748b] hover:text-white transition-colors"
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
            <label className="flex items-center gap-2 text-sm text-[#94a3b8] cursor-pointer">
              <input
                type="checkbox"
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
                className="w-4 h-4 rounded border-[#1e3a5f] bg-[#0d1424] text-[#00d4ff] focus:ring-[#00d4ff] cursor-pointer"
              />
              Log scale
            </label>
            {repos.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-[#94a3b8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={alignTimeline}
                  onChange={(e) => setAlignTimeline(e.target.checked)}
                  className="w-4 h-4 rounded border-[#1e3a5f] bg-[#0d1424] text-[#00d4ff] focus:ring-[#00d4ff] cursor-pointer"
                />
                Align timeline
              </label>
            )}
            <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
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
            <Loader2 size={48} className="text-[#00d4ff] animate-spin mb-4" />
            <p className="text-[#64748b]">Loading star history...</p>
          </div>
        ) : repos.length > 0 && (
          <>
            {/* Chart */}
            {chart && (
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-4 sm:p-6 mb-6 relative">
                {/* Legend */}
                <div 
                  className={`absolute z-10 bg-[#0d1424]/90 border border-[#1e3a5f] rounded-lg px-3 py-2 ${
                    legendPosition === 'top-left' ? 'top-4 left-4' : 'bottom-16 right-4'
                  }`}
                >
                  {repos.map(repo => (
                    <div key={repo.fullName} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: repo.color }} />
                      <span className="text-white font-mono">{repo.fullName}</span>
                    </div>
                  ))}
                </div>

                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
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
                        stroke="#1e3a5f"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                      <text
                        x={chart.padding.left - 12}
                        y={label.y + 4}
                        textAnchor="end"
                        fontSize="12"
                        fill="#64748b"
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
                      fill="#64748b"
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
                            fill="#0d1424"
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
                    fill="#475569"
                    transform={`rotate(-90, ${chart.padding.left - 50}, ${chart.height / 2})`}
                  >
                    GitHub Stars
                  </text>
                  <text
                    x={chart.width / 2}
                    y={chart.height - 10}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#475569"
                  >
                    Date
                  </text>

                  {/* Watermark */}
                  <text
                    x={chart.width - chart.padding.right}
                    y={chart.height - chart.padding.bottom - 10}
                    textAnchor="end"
                    fontSize="10"
                    fill="#475569"
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
                  className="flex items-center gap-2 px-4 py-2 bg-[#0d1424] border border-[#1e3a5f] hover:border-[#00d4ff] text-white text-sm rounded-lg transition-colors"
                >
                  <ImageIcon size={16} />
                  Image
                </button>
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0d1424] border border-[#1e3a5f] hover:border-[#00d4ff] text-white text-sm rounded-lg transition-colors"
                >
                  <FileText size={16} />
                  CSV
                </button>
                <button
                  onClick={() => copyToClipboard(getEmbedCode(), 'embed')}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0d1424] border border-[#1e3a5f] hover:border-[#00d4ff] text-white text-sm rounded-lg transition-colors"
                >
                  {copied === 'embed' ? <Check size={16} className="text-[#22c55e]" /> : <Copy size={16} />}
                  Embed
                </button>
                <button
                  onClick={() => copyToClipboard(getShareLink(), 'link')}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0d1424] border border-[#1e3a5f] hover:border-[#00d4ff] text-white text-sm rounded-lg transition-colors"
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
            <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-4 mb-8">
              <p className="text-sm text-[#94a3b8] mb-3">
                🌟 Show real-time chart on your{' '}
                <a href="https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes" className="text-[#00d4ff] hover:underline" target="_blank" rel="noopener noreferrer">README.md</a>
                {' '}with the following code:
              </p>
              <div className="bg-[#050810] rounded-lg p-4 font-mono text-sm text-[#94a3b8] overflow-x-auto">
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
              <span className="text-xs text-[#64748b] ml-4">(dark theme supported)</span>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Star className="text-[#fbbf24] fill-[#fbbf24]" size={24} />
                  <span className="text-3xl font-bold text-white tabular-nums">
                    {repos.reduce((sum, r) => sum + r.totalStars, 0).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">{repos.length > 1 ? 'Combined Stars' : 'Total Stars'}</p>
              </div>
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="text-[#22c55e]" size={24} />
                  <span className="text-3xl font-bold text-white tabular-nums">
                    {repos.length}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">Repositories</p>
              </div>
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="text-[#00d4ff]" size={24} />
                  <span className="text-lg font-bold text-white">
                    {repos[0]?.history?.length > 1
                      ? new Date(repos[0].history[0].date).toLocaleDateString()
                      : 'Today'}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">First Tracked</p>
              </div>
            </div>

            {/* History Table (for first repo) */}
            {repos[0] && repos[0].history.length > 1 && (
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#1e3a5f]">
                  <h2 className="text-lg font-semibold text-white">History Data - {repos[0].fullName}</h2>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-[#0a0f1a] sticky top-0">
                      <tr>
                        <th className="text-left p-3 text-xs text-[#64748b] font-medium">Date</th>
                        <th className="text-right p-3 text-xs text-[#64748b] font-medium">Stars</th>
                        <th className="text-right p-3 text-xs text-[#64748b] font-medium">Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...repos[0].history].reverse().map((point, i, arr) => {
                        const prevStars = arr[i + 1]?.stars || 0;
                        const growth = point.stars - prevStars;
                        return (
                          <tr key={i} className="border-t border-[#1e3a5f]/50 hover:bg-[#1e3a5f]/20">
                            <td className="p-3 text-sm text-[#e2e8f0] font-mono">
                              {new Date(point.date).toLocaleDateString()}
                            </td>
                            <td className="p-3 text-sm text-right font-mono" style={{ color: repos[0].color }}>
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
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-[#475569]">
              <p>
                Powered by{' '}
                <a
                  href="https://motia.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00d4ff] hover:underline font-medium"
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
