import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

interface StarAnimationProps {
  starCount: number;
  isActive: boolean;
}

const StarAnimation: React.FC<StarAnimationProps> = ({ starCount, isActive }) => {
  const [floatingStars, setFloatingStars] = useState<{ id: number; x: number; delay: number }[]>([]);

  useEffect(() => {
    if (!isActive) {
      setFloatingStars([]);
      return;
    }

    // Create initial burst of stars
    const initialStars = Array.from({ length: 15 }).map((_, i) => ({
      id: Date.now() + i,
      x: 10 + Math.random() * 80,
      delay: Math.random() * 0.5,
    }));
    setFloatingStars(initialStars);

    // Add periodic stars
    const interval = setInterval(() => {
      setFloatingStars(prev => {
        const newStar = {
          id: Date.now(),
          x: 10 + Math.random() * 80,
          delay: 0,
        };
        return [...prev.slice(-20), newStar];
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
      {/* Floating stars */}
      {floatingStars.map(star => (
        <div
          key={star.id}
          className="absolute animate-float-up"
          style={{
            left: `${star.x}%`,
            bottom: '-20px',
            animationDelay: `${star.delay}s`,
          }}
        >
          <Star size={14} className="text-[#fbbf24] fill-[#fbbf24] drop-shadow-lg" />
        </div>
      ))}

      {/* Central star count display */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 animate-pulse">
        <Star size={32} className="text-[#fbbf24] fill-[#fbbf24]" />
        <span className="text-[#fbbf24] font-bold text-3xl tabular-nums">
          {starCount.toLocaleString()}
        </span>
        <span className="text-[#fbbf24]/60 text-lg">stars</span>
      </div>
    </div>
  );
};

export default StarAnimation;
