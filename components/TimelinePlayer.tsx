import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, FastForward, Rewind } from 'lucide-react';

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

interface TimelinePlayerProps {
  commits: CommitData[];
  onCommitChange: (commit: CommitData | null, index: number) => void;
  onFilesActive: (files: Set<string>) => void;
  isLoading?: boolean;
}

const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  commits,
  onCommitChange,
  onFilesActive,
  isLoading = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState(1); // commits per second
  const [activeFiles, setActiveFiles] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Handle playback
  useEffect(() => {
    if (isPlaying && commits.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= commits.length) {
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }, 1000 / speed);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, speed, commits.length]);

  // Update active files when index changes
  useEffect(() => {
    if (commits.length === 0) return;

    // Build set of all files modified up to current commit
    const files = new Set<string>();
    for (let i = 0; i <= currentIndex && i < commits.length; i++) {
      commits[i].files.forEach((f) => {
        if (f.status !== 'removed') {
          files.add(f.filename);
        } else {
          files.delete(f.filename);
        }
      });
    }
    setActiveFiles(files);
    onFilesActive(files);
    onCommitChange(commits[currentIndex] || null, currentIndex);
  }, [currentIndex, commits, onCommitChange, onFilesActive]);

  const handlePlayPause = useCallback(() => {
    if (currentIndex >= commits.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying((prev) => !prev);
  }, [currentIndex, commits.length]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setCurrentIndex(value);
    setIsPlaying(false);
  }, []);

  const handleSkipBack = useCallback(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, []);

  const handleSkipForward = useCallback(() => {
    setCurrentIndex(commits.length - 1);
    setIsPlaying(false);
  }, [commits.length]);

  const handleStepBack = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setIsPlaying(false);
  }, []);

  const handleStepForward = useCallback(() => {
    setCurrentIndex((prev) => Math.min(commits.length - 1, prev + 1));
    setIsPlaying(false);
  }, [commits.length]);

  const currentCommit = commits[currentIndex];

  if (commits.length === 0) {
    return (
      <div className="bg-[#0d1424]/95 border border-[#1e3a5f] rounded-lg p-3">
        <div className="text-sm text-[#64748b] text-center">
          {isLoading ? 'Loading commit history...' : 'No commits to display'}
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-[#0d1424]/95 border border-[#1e3a5f] rounded-lg p-3 space-y-3">
      {/* Current Commit Info */}
      {currentCommit && (
        <div className="flex items-start gap-3">
          {currentCommit.author.avatar && (
            <img
              src={currentCommit.author.avatar}
              alt={currentCommit.author.name}
              className="w-8 h-8 rounded-full border border-[#1e3a5f]"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">
                {currentCommit.author.name}
              </span>
              <span className="text-xs text-[#64748b]">
                {formatDate(currentCommit.date)}
              </span>
            </div>
            <div className="text-xs text-[#94a3b8] truncate" title={currentCommit.message}>
              {currentCommit.message.split('\n')[0]}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-[#22c55e]">
                +{currentCommit.files.reduce((acc, f) => acc + f.additions, 0)}
              </span>
              <span className="text-[10px] text-[#ef4444]">
                -{currentCommit.files.reduce((acc, f) => acc + f.deletions, 0)}
              </span>
              <span className="text-[10px] text-[#64748b]">
                {currentCommit.files.length} files
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={commits.length - 1}
          value={currentIndex}
          onChange={handleSliderChange}
          className="w-full h-1.5 bg-[#1e3a5f] rounded-lg appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#00d4ff]
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-[#0d1424]
            [&::-webkit-slider-thumb]:shadow-lg"
        />
        <div className="flex justify-between mt-1 text-[10px] text-[#64748b]">
          <span>{commits.length > 0 ? formatDate(commits[0].date) : ''}</span>
          <span>{commits.length > 0 ? formatDate(commits[commits.length - 1].date) : ''}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSkipBack}
            className="p-1.5 text-[#64748b] hover:text-[#00d4ff] transition-colors"
            title="Go to start"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={handleStepBack}
            className="p-1.5 text-[#64748b] hover:text-[#00d4ff] transition-colors"
            title="Previous commit"
          >
            <Rewind size={14} />
          </button>
          <button
            onClick={handlePlayPause}
            className="p-2 bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0d1424] rounded-full transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button
            onClick={handleStepForward}
            className="p-1.5 text-[#64748b] hover:text-[#00d4ff] transition-colors"
            title="Next commit"
          >
            <FastForward size={14} />
          </button>
          <button
            onClick={handleSkipForward}
            className="p-1.5 text-[#64748b] hover:text-[#00d4ff] transition-colors"
            title="Go to end"
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#64748b]">Speed:</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="bg-[#1e3a5f] border border-[#1e3a5f] text-[#e2e8f0] text-xs rounded px-2 py-1"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
          </select>
        </div>

        {/* Progress */}
        <div className="text-[10px] text-[#64748b]">
          {currentIndex + 1} / {commits.length}
        </div>
      </div>

      {/* Active Files Preview */}
      {currentCommit && currentCommit.files.length > 0 && (
        <div className="pt-2 border-t border-[#1e3a5f]">
          <div className="text-[10px] text-[#64748b] mb-1">Changed files:</div>
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {currentCommit.files.slice(0, 10).map((file) => (
              <span
                key={file.filename}
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  file.status === 'added'
                    ? 'bg-[#22c55e]/20 text-[#22c55e]'
                    : file.status === 'removed'
                    ? 'bg-[#ef4444]/20 text-[#ef4444]'
                    : 'bg-[#f59e0b]/20 text-[#f59e0b]'
                }`}
              >
                {file.filename.split('/').pop()}
              </span>
            ))}
            {currentCommit.files.length > 10 && (
              <span className="text-[9px] text-[#64748b]">
                +{currentCommit.files.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelinePlayer;



