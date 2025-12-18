import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { RepoData, RepoNode, RepoLink } from '../types';
import { ZoomIn, ZoomOut, Maximize2, Circle, GitBranch, History, X, Layers } from 'lucide-react';
import TimelinePlayer, { CommitData } from './TimelinePlayer';

interface VisualizerProps {
  data: RepoData;
  onNodeSelect: (node: RepoNode) => void;
  highlightedNodes?: Set<string>;
  focusNode?: RepoNode | null;
  commits?: CommitData[];
  isLoadingCommits?: boolean;
  onLoadCommits?: () => void;
}

type LayoutMode = 'force' | 'pack';

// ORIGINAL Force mode colors (simple, clean palette)
const getForceNodeColor = (node: RepoNode): string => {
  if (node.id === 'ROOT') return '#00d4ff';
  if (node.type === 'tree') return '#3b82f6';

  switch (node.extension) {
    case 'ts': case 'tsx': return '#0ea5e9';
    case 'js': case 'jsx': return '#22c55e';
    case 'css': case 'scss': case 'less': return '#06b6d4';
    case 'html': return '#f97316';
    case 'json': case 'yml': case 'yaml': case 'toml': return '#64748b';
    case 'md': case 'mdx': return '#94a3b8';
    case 'py': return '#22c55e';
    case 'go': return '#00bcd4';
    case 'rs': return '#ef4444';
    case 'java': case 'kt': return '#f59e0b';
    default: return '#475569';
  }
};

// GitHub Next-style VIBRANT & VARIED color palette for Pack mode
const PACK_FILE_COLORS: Record<string, string> = {
  // TypeScript - Electric Cyan/Blue
  'ts': '#00d4ff',
  'tsx': '#38bdf8',
  'd.ts': '#7dd3fc',
  // JavaScript - Golden Yellow
  'js': '#fbbf24',
  'jsx': '#fcd34d',
  'mjs': '#f59e0b',
  'cjs': '#d97706',
  // Styles - Hot Pink/Magenta
  'css': '#f472b6',
  'scss': '#ec4899',
  'sass': '#db2777',
  'less': '#e879f9',
  // HTML/Templates - Orange/Coral
  'html': '#fb923c',
  'vue': '#4ade80',
  'svelte': '#ff6b6b',
  // Config/Data - Teal/Aqua
  'json': '#2dd4bf',
  'yml': '#5eead4',
  'yaml': '#14b8a6',
  'toml': '#0d9488',
  'xml': '#06b6d4',
  // Docs - Coral/Salmon (warm, not purple!)
  'md': '#fb7185',
  'mdx': '#fda4af',
  'txt': '#fca5a5',
  // Python - Bright Green
  'py': '#4ade80',
  'pyx': '#86efac',
  // Go - Bright Cyan
  'go': '#22d3ee',
  'mod': '#67e8f9',
  // Rust - Burnt Orange
  'rs': '#ea580c',
  // Java/Kotlin - Warm Amber
  'java': '#fbbf24',
  'kt': '#f59e0b',
  // Ruby - Cherry Red
  'rb': '#f87171',
  'erb': '#fca5a5',
  // PHP - Indigo
  'php': '#818cf8',
  // Shell/Scripts - Lime Green
  'sh': '#a3e635',
  'bash': '#84cc16',
  'zsh': '#65a30d',
  // Images - Emerald/Teal (distinct from code)
  'png': '#34d399',
  'jpg': '#10b981',
  'jpeg': '#10b981',
  'svg': '#6ee7b7',
  'gif': '#059669',
  'ico': '#047857',
  'webp': '#0d9488',
  // Lock/Config - Cool Gray
  'lock': '#64748b',
  'env': '#78716c',
  // Default - Soft lavender
  'default': '#c4b5fd',
};

// Get Pack mode vibrant color (GitHub Next style)
const getPackNodeColor = (node: RepoNode): string => {
  if (node.id === 'ROOT') return '#00d4ff';
  if (node.type === 'tree') return '#1e293b'; // Dark folders
  
  const ext = node.extension?.toLowerCase() || 'default';
  return PACK_FILE_COLORS[ext] || PACK_FILE_COLORS['default'];
};

// Get node size based on type and file size
const getNodeSize = (node: RepoNode): number => {
  if (node.id === 'ROOT') return 18;
  if (node.type === 'tree') return 10;
  
  // Scale file size logarithmically (min 3, max 12)
  if (node.size) {
    const logSize = Math.log10(node.size + 1);
    return Math.min(12, Math.max(3, logSize * 2));
  }
  return 4;
};

// Build hierarchy from flat nodes for circle packing
const buildHierarchy = (nodes: RepoNode[]): d3.HierarchyNode<RepoNode> => {
  const nodeMap = new Map<string, RepoNode>();
  nodes.forEach(n => nodeMap.set(n.id, { ...n, children: [] as RepoNode[] }));
  
  const root = nodeMap.get('ROOT')!;
  
  nodes.forEach(n => {
    if (n.parentId && nodeMap.has(n.parentId)) {
      const parent = nodeMap.get(n.parentId)!;
      if (!parent.children) parent.children = [];
      (parent.children as RepoNode[]).push(nodeMap.get(n.id)!);
    }
  });
  
  return d3.hierarchy(root)
    .sum(d => d.type === 'blob' ? Math.max(d.size || 100, 100) : 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
};

const Visualizer: React.FC<VisualizerProps> = ({ 
  data, 
  onNodeSelect, 
  highlightedNodes = new Set(),
  focusNode,
  commits = [],
  isLoadingCommits = false,
  onLoadCommits,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simulationRef = useRef<d3.Simulation<RepoNode, RepoLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesMapRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [hoveredPath, setHoveredPath] = useState<Set<string>>(new Set());
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [hoveredNode, setHoveredNode] = useState<RepoNode | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showLayoutToggle, setShowLayoutToggle] = useState(false); // Hidden by default
  const [activeFiles, setActiveFiles] = useState<Set<string>>(new Set());
  const [currentCommit, setCurrentCommit] = useState<CommitData | null>(null);

  // Generate random stars for background
  const stars = useMemo(() => {
    const starAreaWidth = dimensions.width * 5;
    const starAreaHeight = dimensions.height * 5;
    const offsetX = -dimensions.width * 2;
    const offsetY = -dimensions.height * 2;
    
    return Array.from({ length: 500 }).map((_, i) => ({
      id: i,
      x: offsetX + Math.random() * starAreaWidth,
      y: offsetY + Math.random() * starAreaHeight,
      r: Math.random() * 1.2 + 0.2,
      opacity: Math.random() * 0.6 + 0.1,
      blink: Math.random() > 0.85
    }));
  }, [dimensions]);

  // Build path to root for any node
  const getPathToRoot = useCallback((nodeId: string, nodes: RepoNode[]): Set<string> => {
    const path = new Set<string>();
    let current = nodes.find(n => n.id === nodeId);
    while (current) {
      path.add(current.id);
      if (current.parentId) {
        current = nodes.find(n => n.id === current!.parentId);
      } else {
        break;
      }
    }
    path.add('ROOT');
    return path;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setTransform(event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    const initialScale = layoutMode === 'pack' ? 0.9 : 0.75;
    svg.call(zoom.transform, d3.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2).scale(initialScale));

    return () => {
      svg.on('.zoom', null);
    };
  }, [dimensions, layoutMode]);

  // Focus on a specific node
  useEffect(() => {
    if (!focusNode || !svgRef.current || !zoomRef.current) return;
    
    const nodePos = nodesMapRef.current.get(focusNode.id);
    if (nodePos) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(500).call(
        zoomRef.current.transform,
        d3.zoomIdentity
          .translate(dimensions.width / 2 - nodePos.x * 1.5, dimensions.height / 2 - nodePos.y * 1.5)
          .scale(1.5)
      );
    }
  }, [focusNode, dimensions]);

  // New Improved Circle Packing Layout (Monaspace/GitHub Next inspired)
  const renderPackLayout = useCallback(() => {
    if (!data.nodes.length || !gRef.current) return;
    
    const g = d3.select(gRef.current);
    g.selectAll('*').remove();
    
    const hierarchy = buildHierarchy(data.nodes);
    
    // Use most of the viewport for the pack
    const margin = 40;
    const availableSize = Math.min(dimensions.width, dimensions.height) - (margin * 2);
    const size = Math.max(400, availableSize * 0.85); // Use 85% of available space
    
    // More padding between circles for clean look
    const pack = d3.pack<RepoNode>()
      .size([size, size])
      .padding(d => d.depth === 0 ? 20 : 8);
    
    const root = pack(hierarchy);
    
    // Center the pack at origin (0, 0) - zoom transform will position it on screen
    const offsetX = -size / 2;
    const offsetY = -size / 2;
    
    const allNodes = root.descendants();
    
    // Draw Nodes
    const nodeGroups = g.selectAll<SVGGElement, d3.HierarchyCircularNode<RepoNode>>('.pack-node')
      .data(allNodes)
      .enter()
      .append('g')
      .attr('class', 'pack-node')
      .attr('transform', d => `translate(${d.x + offsetX},${d.y + offsetY})`)
      .attr('cursor', 'pointer');

    // Update position map for animations
    allNodes.forEach(d => {
      nodesMapRef.current.set(d.data.id, { x: d.x + offsetX, y: d.y + offsetY });
    });

    // Color palette for folder rings based on depth
    const folderRingColors = [
      '#00d4ff', // cyan - depth 1
      '#4ade80', // green - depth 2
      '#fbbf24', // amber - depth 3
      '#f472b6', // pink - depth 4
      '#818cf8', // indigo - depth 5
      '#fb7185', // coral - depth 6+
    ];
    
    const getFolderRingColor = (depth: number): string => {
      const idx = Math.min(depth - 1, folderRingColors.length - 1);
      return folderRingColors[Math.max(0, idx)];
    };

    // Root: Dark background with glowing cyan border
    nodeGroups.filter(d => d.children && d.depth === 0)
      .append('circle')
      .attr('r', d => d.r)
      .attr('fill', '#0a0f1a')
      .attr('stroke', '#00d4ff')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', '8 4');

    // Inner Folders - subtle with colored ring
    nodeGroups.filter(d => d.children && d.depth > 0)
      .append('circle')
      .attr('r', d => d.r)
      .attr('fill', '#0f172a')
      .attr('fill-opacity', 0.3)
      .attr('stroke', d => getFolderRingColor(d.depth))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.35);

    // Files - vibrant dots with subtle glow
    nodeGroups.filter(d => !d.children)
      .append('circle')
      .attr('r', d => Math.max(3, d.r))
      .attr('fill', d => getPackNodeColor(d.data))
      .attr('fill-opacity', 0.9)
      .attr('stroke', d => getPackNodeColor(d.data))
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5);

    // Labels for significant groups
    nodeGroups.filter(d => d.children && d.r > 40)
      .each(function(d) {
        const isRoot = d.depth === 0;
        d3.select(this).append('text')
          .attr('dy', isRoot ? d.r + 25 : -d.r + 15)
          .attr('text-anchor', 'middle')
          .attr('font-size', isRoot ? '16px' : '10px')
          .attr('font-weight', isRoot ? '600' : '500')
          .attr('fill', isRoot ? '#00d4ff' : '#94a3b8')
          .attr('pointer-events', 'none')
          .style('text-shadow', '0 1px 4px rgba(0,0,0,0.8)')
          .text(d.data.name);
      });

    // Hover interactions
    nodeGroups
      .on('mouseenter', function(event, d) {
        setHoveredNode(d.data);
        const circle = d3.select(this).select('circle');
        if (d.children) {
          circle.attr('stroke', '#00d4ff').attr('stroke-opacity', 1).attr('stroke-width', 2);
        } else {
          circle.attr('r', Math.max(2, d.r - 1.5) + 2).attr('stroke', '#fff').attr('stroke-width', 2);
        }
      })
      .on('mouseleave', function(event, d) {
        setHoveredNode(null);
        const circle = d3.select(this).select('circle');
        if (d.children) {
          if (d.depth === 0) {
            circle.attr('stroke', '#334155').attr('stroke-width', 1.5);
          } else {
            circle.attr('stroke', '#475569').attr('stroke-opacity', 0.3).attr('stroke-width', 1);
          }
        } else {
          circle.attr('r', Math.max(2, d.r - 1.5)).attr('stroke', 'none');
        }
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeSelect(d.data);
      });
  }, [data, dimensions, onNodeSelect]);

  // Force-Directed Layout
  const renderForceLayout = useCallback(() => {
    if (!data.nodes.length || !gRef.current) return;

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const g = d3.select(gRef.current);
    g.selectAll('*').remove();

    const simNodes: RepoNode[] = data.nodes.map(d => ({ ...d, x: 0, y: 0 }));
    const simLinks: RepoLink[] = data.links.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<RepoNode, RepoLink>(simLinks)
        .id(d => d.id)
        .distance(35)
        .strength(0.5))
      .force('charge', d3.forceManyBody()
        .strength(-90)
        .distanceMax(180))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(d => getNodeSize(d as RepoNode) + 5))
      .force('x', d3.forceX(0).strength(0.03))
      .force('y', d3.forceY(0).strength(0.03));

    simulationRef.current = simulation;

    // Links
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup.selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'link-line')
      .attr('stroke', '#1e3a5f')
      .attr('stroke-width', 0.8)
      .attr('stroke-opacity', 0.5);

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup.selectAll<SVGGElement, RepoNode>('g')
      .data(simNodes)
      .join('g')
      .attr('class', d => `node-group node-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, RepoNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Circles
    node.each(function(d) {
      const color = getForceNodeColor(d);
      const size = getNodeSize(d);
      const nodeG = d3.select(this);
      
      if (d.id === 'ROOT') {
        nodeG.append('circle')
          .attr('class', 'glow')
          .attr('r', size + 6)
          .attr('fill', color)
          .attr('opacity', 0.15);
      }
      
      nodeG.append('circle')
        .attr('class', 'node-circle')
        .attr('r', size)
        .attr('fill', color)
        .attr('stroke', d.id === 'ROOT' ? '#00d4ff' : 'transparent')
        .attr('stroke-width', d.id === 'ROOT' ? 2 : 0);
    });

    // Labels for directories
    node.filter(d => d.id === 'ROOT' || d.type === 'tree')
      .append('text')
      .attr('class', 'node-label')
      .text(d => d.name)
      .attr('x', 0)
      .attr('y', d => -(getNodeSize(d) + 6))
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.id === 'ROOT' ? '11px' : '8px')
      .attr('font-weight', d => d.id === 'ROOT' ? '600' : '400')
      .attr('fill', '#94a3b8')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('pointer-events', 'none');

    // Hover interactions
    node
      .on('mouseenter', function(event, d) {
        const size = getNodeSize(d);
        const pathNodes = getPathToRoot(d.id, simNodes);
        setHoveredPath(pathNodes);
        setHoveredNode(d);
        
        d3.select(this).select('.node-circle')
          .transition()
          .duration(150)
          .attr('r', size * 1.4);
        
        if (d.type === 'blob') {
          d3.select(this)
            .append('text')
            .attr('class', 'hover-label')
            .text(d.name)
            .attr('x', 0)
            .attr('y', -(size + 8))
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px')
            .attr('fill', '#e2e8f0')
            .attr('font-family', 'ui-monospace, monospace')
            .attr('pointer-events', 'none');
        }
      })
      .on('mouseleave', function(event, d) {
        const size = getNodeSize(d);
        setHoveredPath(new Set());
        setHoveredNode(null);
        
        d3.select(this).select('.node-circle')
          .transition()
          .duration(150)
          .attr('r', size);
        d3.select(this).select('.hover-label').remove();
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeSelect(d);
      });

    simulation.on('tick', () => {
      simNodes.forEach(n => {
        nodesMapRef.current.set(n.id, { x: n.x || 0, y: n.y || 0 });
      });

      link
        .attr('x1', d => (d.source as RepoNode).x || 0)
        .attr('y1', d => (d.source as RepoNode).y || 0)
        .attr('x2', d => (d.target as RepoNode).x || 0)
        .attr('y2', d => (d.target as RepoNode).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [data, onNodeSelect, getPathToRoot]);

  // Render based on layout mode
  useEffect(() => {
    if (layoutMode === 'pack') {
      renderPackLayout();
    } else {
      renderForceLayout();
    }
  }, [layoutMode, renderPackLayout, renderForceLayout]);

  // Update highlighting based on search/hover (force layout only)
  useEffect(() => {
    if (!gRef.current || layoutMode !== 'force') return;
    const g = d3.select(gRef.current);
    
    const hasHighlight = highlightedNodes.size > 0;
    const hasHover = hoveredPath.size > 0;
    const hasActiveFiles = activeFiles.size > 0;
    
    g.selectAll('.node-group').each(function(d: any) {
      if (!d || !d.id) return;
      
      const isHighlighted = highlightedNodes.has(d.id);
      const isInPath = hoveredPath.has(d.id);
      
      // Check if file was recently changed (for heatmap effect)
      const isActiveFile = d.path && activeFiles.has(d.path);
      
      let opacity = 1;
      if (hasHighlight && !isHighlighted) opacity = 0.2;
      if (hasHover && !isInPath) opacity = 0.3;
      if (hasActiveFiles && !isActiveFile && d.type === 'blob') opacity = 0.25;
      if (isInPath || isHighlighted || isActiveFile) opacity = 1;
      
      // Add glow effect for active files
      const circle = d3.select(this).select('.node-circle');
      if (isActiveFile) {
        circle
          .transition()
          .duration(300)
          .attr('stroke', '#f59e0b')
          .attr('stroke-width', 3)
          .attr('filter', 'url(#glow)');
      } else {
        circle
          .transition()
          .duration(300)
          .attr('stroke', d.id === 'ROOT' ? '#00d4ff' : 'transparent')
          .attr('stroke-width', d.id === 'ROOT' ? 2 : 0)
          .attr('filter', null);
      }
      
      d3.select(this)
        .transition()
        .duration(150)
        .style('opacity', opacity);
    });
    
    // Highlight path links
    g.selectAll('.link-line').each(function(d: any) {
      if (!d || !d.source || !d.target) return;
      
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      const isInPath = hoveredPath.has(sourceId) && hoveredPath.has(targetId);
      
      d3.select(this)
        .transition()
        .duration(150)
        .attr('stroke', isInPath ? '#00d4ff' : '#1e3a5f')
        .attr('stroke-width', isInPath ? 1.5 : 0.8)
        .attr('stroke-opacity', isInPath ? 1 : 0.5);
    });
  }, [highlightedNodes, hoveredPath, layoutMode, activeFiles]);

  // Gource-style live commit animation
  useEffect(() => {
    if (!currentCommit || !gRef.current || !svgRef.current || !zoomRef.current) return;

    // Log animation info for debugging
    console.log('[Gource] Commit:', currentCommit.sha.substring(0, 7), 
      '| Files:', currentCommit.files.length, 
      '| Layout:', layoutMode,
      '| Nodes:', nodesMapRef.current.size);

    const g = d3.select(gRef.current);
    
    // Get current transform to calculate positions
    const transform = d3.zoomTransform(svgRef.current);
    
    // Author position - bottom-left of visible area, converted to SVG coordinates
    const screenX = 80;
    const screenY = dimensions.height - 200;
    const [startX, startY] = transform.invert([screenX, screenY]);
    
    // Remove any existing avatar
    g.selectAll('.commit-avatar').remove();
    
    // Add author avatar at the source of projectiles (inside SVG)
    if (currentCommit.author.avatar) {
      const avatarSize = 24 / transform.k; // Scale inversely to zoom
      
      // Create avatar group
      const avatarGroup = g.append('g')
        .attr('class', 'commit-avatar')
        .attr('transform', `translate(${startX}, ${startY})`);
      
      // Glow behind avatar
      avatarGroup.append('circle')
        .attr('r', avatarSize + 4)
        .attr('fill', '#f59e0b')
        .attr('opacity', 0.4)
        .attr('filter', 'url(#glow)');
      
      // Clip path for circular avatar
      const clipId = `avatar-clip-${currentCommit.sha.substring(0, 7)}`;
      avatarGroup.append('clipPath')
        .attr('id', clipId)
        .append('circle')
        .attr('r', avatarSize);
      
      // Avatar image
      avatarGroup.append('image')
        .attr('href', currentCommit.author.avatar)
        .attr('x', -avatarSize)
        .attr('y', -avatarSize)
        .attr('width', avatarSize * 2)
        .attr('height', avatarSize * 2)
        .attr('clip-path', `url(#${clipId})`)
        .attr('opacity', 1);
      
      // Border around avatar
      avatarGroup.append('circle')
        .attr('r', avatarSize)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2 / transform.k);
      
      // Fade out avatar after animation completes
      avatarGroup.transition()
        .delay(1500)
        .duration(500)
        .attr('opacity', 0)
        .remove();
    }

    currentCommit.files.forEach(file => {
      // Find the node for this file using multiple matching strategies
      let targetNode: { x: number, y: number } | undefined;
      
      // Try to find the matching node - file.filename might be like "src/github/file.ts"
      // node.path might be like "src/github/file.ts" or "github/file.ts" or just "file.ts"
      const filename = file.filename;
      const filenameOnly = filename.split('/').pop() || filename;
      
      // Find matching node by path (try multiple matching strategies)
      const node = data.nodes.find(n => {
        if (!n.path) return false;
        // Exact match
        if (n.path === filename) return true;
        // Match without leading slash
        if (n.path === filename.replace(/^\//, '') || filename === n.path.replace(/^\//, '')) return true;
        // Match by filename only (for files in different directory representations)
        const nodeName = n.path.split('/').pop() || n.path;
        if (nodeName === filenameOnly && n.type === 'blob') return true;
        return false;
      });
      
      // Use nodesMapRef for both force and pack layouts (it stores current positions)
      if (node) {
        const pos = nodesMapRef.current.get(node.id);
        // Verify position is valid (not NaN or undefined)
        if (pos && isFinite(pos.x) && isFinite(pos.y)) {
          targetNode = pos;
        } else {
          console.log('[Gource] Invalid position for node:', node.id, pos);
        }
      }

      if (targetNode) {
        // Calculate distance for animation timing
        const distance = Math.sqrt(Math.pow(targetNode.x - startX, 2) + Math.pow(targetNode.y - startY, 2));
        const duration = Math.min(800, Math.max(300, distance * 0.5));
        
        // Create glowing trail line first (will be under the projectile)
        const trail = g.append('line')
          .attr('x1', startX)
          .attr('y1', startY)
          .attr('x2', startX)
          .attr('y2', startY)
          .attr('stroke', '#f59e0b')
          .attr('stroke-width', 2)
          .attr('opacity', 0.6)
          .attr('filter', 'url(#glow)');
        
        // Animate trail to follow projectile
        trail.transition()
          .duration(duration)
          .ease(d3.easeLinear)
          .attr('x2', targetNode.x)
          .attr('y2', targetNode.y)
          .transition()
          .duration(300)
          .attr('opacity', 0)
          .remove();

        // Create projectile (larger and brighter)
        const projectile = g.append('circle')
          .attr('cx', startX)
          .attr('cy', startY)
          .attr('r', 6)
          .attr('fill', '#fbbf24')
          .attr('filter', 'url(#glow)')
          .attr('opacity', 1);

        // Animate projectile
        projectile.transition()
          .duration(duration)
          .ease(d3.easeQuadOut)
          .attr('cx', targetNode.x)
          .attr('cy', targetNode.y)
          .attr('r', 4)
          .on('end', function() {
            // Remove projectile
            d3.select(this).remove();
            
            // Create multiple explosion rings for impact effect
            for (let i = 0; i < 3; i++) {
              const explosion = g.append('circle')
                .attr('cx', targetNode!.x)
                .attr('cy', targetNode!.y)
                .attr('r', 3)
                .attr('fill', 'none')
                .attr('stroke', i === 0 ? '#fbbf24' : i === 1 ? '#f59e0b' : '#ea580c')
                .attr('stroke-width', 3 - i)
                .attr('opacity', 1);
              
              explosion.transition()
                .delay(i * 80)
                .duration(600)
                .ease(d3.easeOut)
                .attr('r', 35 - (i * 8))
                .attr('opacity', 0)
                .attr('stroke-width', 0)
                .remove();
            }
            
            // Flash the target node briefly
            const flash = g.append('circle')
              .attr('cx', targetNode!.x)
              .attr('cy', targetNode!.y)
              .attr('r', 12)
              .attr('fill', '#fbbf24')
              .attr('opacity', 0.8)
              .attr('filter', 'url(#glow)');
              
            flash.transition()
              .duration(400)
              .attr('opacity', 0)
              .attr('r', 8)
              .remove();
          });
      } // else: node not found in visualization (might be beyond the 200 node limit)
    });
  }, [currentCommit, dimensions, layoutMode, data]);

  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.4);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 0.7);
  }, []);

  const handleReset = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const initialScale = layoutMode === 'pack' ? 0.9 : 0.75;
    d3.select(svgRef.current).transition().duration(300)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2).scale(initialScale));
  }, [dimensions, layoutMode]);

  // Extended bounds for zoom-out
  const extendedBounds = useMemo(() => {
    const extend = 5;
    return {
      x: -dimensions.width * (extend / 2),
      y: -dimensions.height * (extend / 2),
      width: dimensions.width * extend,
      height: dimensions.height * extend,
    };
  }, [dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#050810]">
      <svg 
        ref={svgRef} 
        className="w-full h-full"
        width={dimensions.width}
        height={dimensions.height}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="space-bg" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="#0d1424" />
            <stop offset="60%" stopColor="#0a0f1a" />
            <stop offset="100%" stopColor="#050810" />
          </radialGradient>
          {/* Glow filter for active files (heatmap) */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <rect 
          x={extendedBounds.x} 
          y={extendedBounds.y} 
          width={extendedBounds.width} 
          height={extendedBounds.height} 
          fill="#050810" 
          style={{ pointerEvents: 'none' }} 
        />
        <rect width="100%" height="100%" fill="url(#space-bg)" style={{ pointerEvents: 'none' }} />
        
        <g style={{ pointerEvents: 'none' }}>
          {stars.map((star) => (
            <circle 
              key={star.id}
              cx={star.x}
              cy={star.y}
              r={star.r}
              fill="#ffffff"
              opacity={star.opacity}
              style={{ pointerEvents: 'none' }}
              className={star.blink ? "animate-pulse" : ""}
            />
          ))}
        </g>

        <g ref={gRef} style={{ pointerEvents: 'all' }} />
      </svg>
      
      {/* View Options - Compact toggle in top-left */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
        {/* Simple view mode toggle - only show when expanded */}
        {showLayoutToggle ? (
          <div className="flex gap-1 bg-[#0d1424] border border-[#1e3a5f] rounded-lg p-1 shadow-lg">
            <button 
              onClick={() => setLayoutMode('force')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                layoutMode === 'force' 
                  ? 'bg-[#00d4ff] text-[#0d1424]' 
                  : 'text-[#64748b] hover:text-white hover:bg-[#1e3a5f]'
              }`}
              title="Force-directed graph (default)"
            >
              <GitBranch size={12} />
              <span className="hidden sm:inline text-[10px]">Force</span>
            </button>
            <button 
              onClick={() => setLayoutMode('pack')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                layoutMode === 'pack' 
                  ? 'bg-[#00d4ff] text-[#0d1424]' 
                  : 'text-[#64748b] hover:text-white hover:bg-[#1e3a5f]'
              }`}
              title="Circle packing layout"
            >
              <Circle size={12} />
              <span className="hidden sm:inline text-[10px]">Pack</span>
            </button>
            <button
              onClick={() => {
                if (!showTimeline && commits.length === 0 && onLoadCommits) {
                  onLoadCommits();
                }
                setShowTimeline(!showTimeline);
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                showTimeline 
                  ? 'bg-[#f59e0b] text-[#0d1424]' 
                  : 'text-[#64748b] hover:text-white hover:bg-[#1e3a5f]'
              }`}
              title="Git history timeline"
            >
              <History size={12} />
              <span className="hidden sm:inline text-[10px]">Timeline</span>
            </button>
            <button
              onClick={() => setShowLayoutToggle(false)}
              className="px-1.5 py-1 text-[#64748b] hover:text-white"
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLayoutToggle(true)}
            className="p-2.5 bg-[#0d1424] border border-[#1e3a5f] rounded-lg text-[#64748b] hover:text-[#00d4ff] hover:bg-[#1e3a5f] hover:border-[#00d4ff] transition-colors shadow-lg cursor-pointer"
            title="View options (layouts, timeline)"
            style={{ pointerEvents: 'auto' }}
          >
            <Layers size={16} />
          </button>
        )}
      </div>

      {/* Hovered Node Info - positioned below header with high z-index */}
      {hoveredNode && (
        <div className="absolute top-44 left-1/2 -translate-x-1/2 bg-[#0d1424]/95 border border-[#1e3a5f] rounded-lg px-3 py-2 pointer-events-none z-30 shadow-lg">
          <div className="flex items-center gap-2">
            <span 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: layoutMode === 'pack' ? getPackNodeColor(hoveredNode) : getForceNodeColor(hoveredNode) }}
            />
            <span className="text-sm text-white font-mono">{hoveredNode.name}</span>
            {hoveredNode.size && (
              <span className="text-xs text-[#64748b]">
                {hoveredNode.size > 1024 
                  ? `${(hoveredNode.size / 1024).toFixed(1)} KB` 
                  : `${hoveredNode.size} B`}
              </span>
            )}
          </div>
          {hoveredNode.path && (
            <div className="text-xs text-[#64748b] mt-1 font-mono truncate max-w-[300px]">
              {hoveredNode.path}
            </div>
          )}
        </div>
      )}

      
      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button onClick={handleZoomIn} className="p-2 bg-[#0d1424] hover:bg-[#1a2744] border border-[#1e3a5f] rounded text-[#64748b] hover:text-[#00d4ff] transition-colors">
          <ZoomIn size={16} />
        </button>
        <button onClick={handleZoomOut} className="p-2 bg-[#0d1424] hover:bg-[#1a2744] border border-[#1e3a5f] rounded text-[#64748b] hover:text-[#00d4ff] transition-colors">
          <ZoomOut size={16} />
        </button>
        <button onClick={handleReset} className="p-2 bg-[#0d1424] hover:bg-[#1a2744] border border-[#1e3a5f] rounded text-[#64748b] hover:text-[#00d4ff] transition-colors">
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Legend - Shows colors based on layout mode */}
      <div className="absolute top-4 right-4 bg-[#0d1424]/90 border border-[#1e3a5f] rounded px-3 py-2 hidden sm:block">
        {layoutMode === 'force' ? (
          /* Force mode: Original simple colors */
          <div className="text-[10px] text-[#64748b] space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00d4ff]" />
              <span>Root</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
              <span>Directory</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0ea5e9]" />
              <span>TypeScript</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
              <span>JavaScript</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#475569]" />
              <span>Other</span>
            </div>
          </div>
        ) : (
          /* Pack mode: GitHub Next vibrant colors */
          <div className="text-[10px] text-[#94a3b8] space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00d4ff]" />
              <span>TypeScript</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]" />
              <span>JavaScript</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f472b6]" />
              <span>Styles</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fb7185]" />
              <span>Docs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf]" />
              <span>Config</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]" />
              <span>Images</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 text-[10px] text-[#475569] font-mono hidden sm:block">
        {data.nodes.length} nodes · {data.links.length} edges · {Math.round(transform.k * 100)}% · {layoutMode === 'pack' ? 'Pack' : 'Force'}
      </div>

      {/* Mobile Legend */}
      <div className="absolute bottom-24 left-2 sm:hidden">
        <div className="flex flex-wrap items-center gap-2 bg-[#0d1424]/90 border border-[#1e3a5f] rounded-lg px-2 py-1.5 max-w-[200px]">
          {layoutMode === 'force' ? (
            <>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#00d4ff]" />
                <span className="text-[8px] text-[#64748b]">Root</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                <span className="text-[8px] text-[#64748b]">Folder</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0ea5e9]" />
                <span className="text-[8px] text-[#64748b]">TS</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                <span className="text-[8px] text-[#64748b]">JS</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#00d4ff]" />
                <span className="text-[8px] text-[#94a3b8]">TS</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#fbbf24]" />
                <span className="text-[8px] text-[#94a3b8]">JS</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#f472b6]" />
                <span className="text-[8px] text-[#94a3b8]">CSS</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#fb7185]" />
                <span className="text-[8px] text-[#94a3b8]">MD</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Timeline Panel (Gource-style git history) */}
      {showTimeline && (
        <div className="absolute bottom-20 sm:bottom-16 left-4 right-4 sm:right-auto sm:w-96 z-30">
          <div className="relative">
            <button
              onClick={() => setShowTimeline(false)}
              className="absolute -top-2 -right-2 p-1 bg-[#1e3a5f] hover:bg-[#2d4a6f] rounded-full text-[#64748b] hover:text-white z-10"
            >
              <X size={14} />
            </button>
            <TimelinePlayer
              commits={commits}
              onCommitChange={setCurrentCommit}
              onFilesActive={setActiveFiles}
              isLoading={isLoadingCommits}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Visualizer;
