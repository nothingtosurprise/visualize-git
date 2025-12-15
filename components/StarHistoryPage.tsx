import React, { useEffect, useState, useMemo } from 'react';
import { RepoInfo } from '../types';
import { Star, X, TrendingUp, Loader2, ExternalLink, Zap } from 'lucide-react';

interface StarHistoryPageProps {
  repoInfo: RepoInfo;
  onClose: () => void;
  token?: string;
}

interface StarDataPoint {
  date: string;
  stars: number;
}

interface StarData {
  owner: string;
  repo: string;
  totalStars: number;
  history: StarDataPoint[];
}

// Use relative URLs in production (goes through Vercel proxy)
const isProduction = import.meta.env.PROD;
const API_BASE = isProduction ? '' : 'http://localhost:3001';

const StarHistoryPage: React.FC<StarHistoryPageProps> = ({ repoInfo, onClose, token }) => {
  const [data, setData] = useState<StarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    const loadStarHistory = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // First, start tracking via Motia API
        const trackResponse = await fetch(`${API_BASE}/api/github/track-stars`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: repoInfo.owner.login,
            repo: repoInfo.name,
          }),
        });

        if (trackResponse.ok) {
          setIsTracking(true);
        }

        // Then fetch history with token for rate limits
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        const historyResponse = await fetch(
          `${API_BASE}/api/github/stars/${repoInfo.owner.login}/${repoInfo.name}${tokenParam}`
        );

        if (!historyResponse.ok) {
          throw new Error('Failed to fetch star history');
        }

        const historyData = await historyResponse.json();
        setData({
          owner: repoInfo.owner.login,
          repo: repoInfo.name,
          totalStars: historyData.totalStars,
          history: historyData.history,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load star history');
        // Fallback to just showing current stars
        setData({
          owner: repoInfo.owner.login,
          repo: repoInfo.name,
          totalStars: repoInfo.stars,
          history: [{ date: new Date().toISOString().split('T')[0], stars: repoInfo.stars }],
        });
      } finally {
        setLoading(false);
      }
    };

    loadStarHistory();

    // Set up WebSocket for real-time updates (only in development)
    // WebSocket streaming is not available in production (Vercel serverless)
    if (isProduction) {
      return; // Skip WebSocket in production
    }
    
    const wsUrl = `ws://localhost:3001/__streams/stars?groupId=${repoInfo.owner.login}&id=${repoInfo.name}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'history-updated' || message.type === 'update') {
          // Refresh data on update
          loadStarHistory();
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [repoInfo, token]);

  // Chart calculations
  const chart = useMemo(() => {
    if (!data || data.history.length < 2) return null;

    const width = 800;
    const height = 400;
    const padding = { top: 40, right: 60, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxStars = Math.max(...data.history.map(d => d.stars));
    const dates = data.history.map(d => new Date(d.date).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);

    const xScale = (date: string) => {
      const t = new Date(date).getTime();
      return padding.left + ((t - minDate) / (maxDate - minDate || 1)) * chartWidth;
    };

    const yScale = (stars: number) => {
      return padding.top + chartHeight - (stars / (maxStars || 1)) * chartHeight;
    };

    // Generate smooth path using curve
    const pathPoints = data.history.map(d => ({ x: xScale(d.date), y: yScale(d.stars) }));
    const linePath = `M ${pathPoints.map(p => `${p.x},${p.y}`).join(' L ')}`;
    const areaPath = `${linePath} L ${pathPoints[pathPoints.length - 1].x},${height - padding.bottom} L ${pathPoints[0].x},${height - padding.bottom} Z`;

    // Y-axis labels
    const ySteps = 5;
    const yLabels = Array.from({ length: ySteps + 1 }).map((_, i) => {
      const stars = Math.round((maxStars / ySteps) * i);
      return {
        stars,
        y: yScale(stars),
        label: stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k` : stars.toString(),
      };
    });

    // X-axis labels
    const xSteps = Math.min(6, data.history.length);
    const xLabels = Array.from({ length: xSteps }).map((_, i) => {
      const index = Math.floor((data.history.length - 1) * (i / (xSteps - 1)));
      const point = data.history[index];
      const date = new Date(point.date);
      return {
        x: xScale(point.date),
        label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
    });

    return { width, height, linePath, areaPath, yLabels, xLabels, padding, pathPoints, chartWidth, chartHeight };
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050810] overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-[#050810]/95 backdrop-blur border-b border-[#1e3a5f] p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img 
            src={repoInfo.owner.avatar} 
            alt={repoInfo.owner.login}
            className="w-10 h-10 rounded-lg"
          />
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Star className="text-[#fbbf24] fill-[#fbbf24]" size={20} />
              {repoInfo.owner.login}/{repoInfo.name}
            </h1>
            <p className="text-sm text-[#64748b]">Star History · Powered by Motia</p>
          </div>
          {isTracking && (
            <span className="flex items-center gap-1 text-xs text-[#22c55e] bg-[#22c55e]/10 px-2 py-1 rounded-full border border-[#22c55e]/20">
              <Zap size={10} className="animate-pulse" />
              Real-time
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`https://github.com/${repoInfo.owner.login}/${repoInfo.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-[#00d4ff] text-sm rounded transition-colors"
          >
            <ExternalLink size={14} />
            View on GitHub
          </a>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#1e3a5f] rounded transition-colors text-[#64748b] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-96">
            <Loader2 size={48} className="text-[#00d4ff] animate-spin mb-4" />
            <p className="text-[#64748b]">Loading star history...</p>
          </div>
        ) : error && !data ? (
          <div className="flex flex-col items-center justify-center h-96">
            <p className="text-[#ef4444] mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded"
            >
              Go Back
            </button>
          </div>
        ) : data && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Star className="text-[#fbbf24] fill-[#fbbf24]" size={24} />
                  <span className="text-3xl font-bold text-white tabular-nums">
                    {data.totalStars.toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">Total Stars</p>
              </div>
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="text-[#22c55e]" size={24} />
                  <span className="text-3xl font-bold text-white tabular-nums">
                    {data.history.length}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">Data Points</p>
              </div>
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="text-[#00d4ff]" size={24} />
                  <span className="text-lg font-bold text-white">
                    {data.history.length > 1
                      ? new Date(data.history[0].date).toLocaleDateString()
                      : 'Today'}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">First Tracked</p>
              </div>
            </div>

            {/* Chart */}
            {chart && (
              <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl p-6 mb-8">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-[#00d4ff]" />
                  Star Growth Over Time
                </h2>
                <svg
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

                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="starChartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.02" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Area fill */}
                  <path
                    d={chart.areaPath}
                    fill="url(#starChartGradient)"
                  />

                  {/* Line */}
                  <path
                    d={chart.linePath}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#glow)"
                  />

                  {/* Data points */}
                  {chart.pathPoints.map((point, i) => (
                    <g key={i}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="6"
                        fill="#0d1424"
                        stroke="#fbbf24"
                        strokeWidth="2"
                        className="hover:r-8 transition-all cursor-pointer"
                      />
                      <title>
                        {data.history[i].date}: {data.history[i].stars.toLocaleString()} stars
                      </title>
                    </g>
                  ))}

                  {/* Current star indicator */}
                  {chart.pathPoints.length > 0 && (
                    <g>
                      <circle
                        cx={chart.pathPoints[chart.pathPoints.length - 1].x}
                        cy={chart.pathPoints[chart.pathPoints.length - 1].y}
                        r="10"
                        fill="#fbbf24"
                        className="animate-pulse"
                      />
                      <text
                        x={chart.pathPoints[chart.pathPoints.length - 1].x + 16}
                        y={chart.pathPoints[chart.pathPoints.length - 1].y + 4}
                        fontSize="14"
                        fontWeight="bold"
                        fill="#fbbf24"
                        fontFamily="ui-monospace, monospace"
                      >
                        {data.totalStars.toLocaleString()}
                      </text>
                    </g>
                  )}

                  {/* Axis labels */}
                  <text
                    x={chart.padding.left - 50}
                    y={chart.height / 2}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#475569"
                    transform={`rotate(-90, ${chart.padding.left - 50}, ${chart.height / 2})`}
                  >
                    Stars
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
                </svg>
              </div>
            )}

            {/* History Table */}
            <div className="bg-[#0d1424] border border-[#1e3a5f] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#1e3a5f]">
                <h2 className="text-lg font-semibold text-white">History Data</h2>
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
                    {[...data.history].reverse().map((point, i, arr) => {
                      const prevStars = arr[i + 1]?.stars || 0;
                      const growth = point.stars - prevStars;
                      return (
                        <tr key={i} className="border-t border-[#1e3a5f]/50 hover:bg-[#1e3a5f]/20">
                          <td className="p-3 text-sm text-[#e2e8f0] font-mono">
                            {new Date(point.date).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-sm text-right text-[#fbbf24] font-mono">
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

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-[#475569]">
              <p>
                Built with{' '}
                <a
                  href="https://github.com/MotiaDev/motia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00d4ff] hover:underline"
                >
                  Motia
                </a>
                {' '}· Inspired by{' '}
                <a
                  href="https://github.com/MotiaDev/github-stars-counter"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00d4ff] hover:underline"
                >
                  github-stars-counter
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StarHistoryPage;

