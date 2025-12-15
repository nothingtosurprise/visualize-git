import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { RepoNode } from '../types';

interface SearchBarProps {
  nodes: RepoNode[];
  onHighlight: (nodeIds: Set<string>) => void;
  onFocusNode: (node: RepoNode) => void;
}

const EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'css', 'json', 'md', 'py', 'go', 'rs'];

const SearchBar: React.FC<SearchBarProps> = ({ nodes, onHighlight, onFocusNode }) => {
  const [query, setQuery] = useState('');
  const [selectedExt, setSelectedExt] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Compute filtered results without side effects
  const results = useMemo(() => {
    if (!query && !selectedExt) {
      return [];
    }

    const filtered = nodes.filter(node => {
      const matchesQuery = query 
        ? node.name.toLowerCase().includes(query.toLowerCase()) ||
          node.path.toLowerCase().includes(query.toLowerCase())
        : true;
      
      const matchesExt = selectedExt 
        ? node.extension === selectedExt
        : true;

      return matchesQuery && matchesExt && node.id !== 'ROOT';
    });

    return filtered.slice(0, 8); // Show top 8 results
  }, [query, selectedExt, nodes]);

  // Update highlights in useEffect (not during render)
  useEffect(() => {
    if (!query && !selectedExt) {
      onHighlight(new Set());
    } else {
      const filtered = nodes.filter(node => {
        const matchesQuery = query 
          ? node.name.toLowerCase().includes(query.toLowerCase()) ||
            node.path.toLowerCase().includes(query.toLowerCase())
          : true;
        const matchesExt = selectedExt ? node.extension === selectedExt : true;
        return matchesQuery && matchesExt && node.id !== 'ROOT';
      });
      onHighlight(new Set(filtered.map(n => n.id)));
    }
  }, [query, selectedExt, nodes, onHighlight]);

  const handleClear = () => {
    setQuery('');
    setSelectedExt(null);
    onHighlight(new Set());
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-9 pr-8 py-1.5 bg-[#0d1424] border border-[#1e3a5f] rounded text-xs text-[#e2e8f0] placeholder-[#475569] focus:outline-none focus:border-[#00d4ff] transition-colors font-mono"
          />
          {(query || selectedExt) && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8]"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-1.5 border rounded transition-colors ${
            selectedExt 
              ? 'bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff]' 
              : 'bg-[#0d1424] border-[#1e3a5f] text-[#475569] hover:text-[#94a3b8]'
          }`}
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Extension Filters */}
      {showFilters && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1424] border border-[#1e3a5f] rounded p-2 z-50">
          <div className="text-[9px] text-[#475569] mb-1.5">Filter by extension</div>
          <div className="flex flex-wrap gap-1">
            {EXTENSIONS.map(ext => (
              <button
                key={ext}
                onClick={() => setSelectedExt(selectedExt === ext ? null : ext)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  selectedExt === ext
                    ? 'bg-[#00d4ff] text-[#050810]'
                    : 'bg-[#1e3a5f] text-[#94a3b8] hover:bg-[#2a4a6f]'
                }`}
              >
                .{ext}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results Dropdown */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1424] border border-[#1e3a5f] rounded overflow-hidden z-40 max-h-48 overflow-y-auto">
          {results.map(node => (
            <button
              key={node.id}
              onClick={() => onFocusNode(node)}
              className="w-full px-3 py-2 text-left hover:bg-[#1e3a5f] transition-colors border-b border-[#1e3a5f]/50 last:border-0"
            >
              <div className="text-[11px] text-[#e2e8f0] font-mono truncate">{node.name}</div>
              <div className="text-[9px] text-[#475569] truncate">{node.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

