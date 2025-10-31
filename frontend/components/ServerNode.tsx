import { Server } from 'lucide-react';
import { useState } from 'react';

interface ServerNodeProps {
  x: number;
  y: number;
  agentCount: number;
  onMouseDown?: (e: React.MouseEvent) => void;
  isDragging?: boolean;
  serverId?: string;
}

export function ServerNode({ x, y, agentCount, onMouseDown, isDragging, serverId = 'main' }: ServerNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const gradientId = `server-gradient-${serverId}`;

  return (
    <g
      style={{
        transform: isHovered && !isDragging ? 'scale(1.05)' : 'scale(1)',
        transformOrigin: `${x}px ${y}px`,
        transition: isDragging ? 'none' : 'transform 0.2s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.8 : 1,
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Define gradient and animations */}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#DC2626', stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: '#991B1B', stopOpacity: 0.3 }} />
        </linearGradient>
        <style>{`
          @keyframes breathing {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          @keyframes pulse-glow {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
          }

          @media (prefers-reduced-motion: reduce) {
            * {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>
      </defs>

      {/* Outer glow - breathing animation */}
      <rect
        x={x - 60}
        y={y - 50}
        width="120"
        height="100"
        rx="10"
        fill="none"
        stroke="#DC2626"
        strokeWidth="2"
        opacity={isHovered ? 1 : undefined}
        style={{
          filter: 'blur(12px)',
          animation: 'breathing 3s ease-in-out infinite',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Inner glow */}
      <rect
        x={x - 60}
        y={y - 50}
        width="120"
        height="100"
        rx="10"
        fill="none"
        stroke="#EF4444"
        strokeWidth="1"
        opacity={isHovered ? 0.8 : 0.5}
        style={{
          filter: 'blur(6px)',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Main server box with glass effect */}
      <rect
        x={x - 60}
        y={y - 50}
        width="120"
        height="100"
        rx="10"
        fill={`url(#${gradientId})`}
        style={{
          filter: isHovered
            ? 'drop-shadow(0 12px 32px rgba(220, 38, 38, 0.7)) drop-shadow(0 0 24px rgba(220, 38, 38, 0.5))'
            : 'drop-shadow(0 8px 24px rgba(220, 38, 38, 0.5))',
          transition: 'filter 0.2s ease',
        }}
      />

      {/* Semi-transparent overlay */}
      <rect
        x={x - 60}
        y={y - 50}
        width="120"
        height="100"
        rx="10"
        fill="rgba(17, 24, 39, 0.6)"
        style={{
          backdropFilter: 'blur(12px)',
        }}
      />

      {/* Border */}
      <rect
        x={x - 60}
        y={y - 50}
        width="120"
        height="100"
        rx="10"
        fill="none"
        stroke="#DC2626"
        strokeWidth="2"
      />

      {/* Icon */}
      <foreignObject x={x - 20} y={y - 35} width="40" height="40">
        <div className="flex items-center justify-center h-full">
          <Server className="w-8 h-8 text-red-500 drop-shadow-lg" style={{
            filter: isHovered
              ? 'drop-shadow(0 0 12px rgba(239, 68, 68, 1)) drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))'
              : 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))',
            transition: 'filter 0.2s ease',
          }} />
        </div>
      </foreignObject>

      {/* Label */}
      <text
        x={x}
        y={y + 10}
        textAnchor="middle"
        className="fill-white text-sm font-bold"
        style={{
          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))',
        }}
      >
        C2 SERVER
      </text>

      {/* Agent count */}
      <text
        x={x}
        y={y + 30}
        textAnchor="middle"
        className="fill-gray-300 text-xs"
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))',
        }}
      >
        {agentCount} agent{agentCount !== 1 ? 's' : ''}
      </text>
    </g>
  );
}
