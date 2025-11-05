import { Monitor } from 'lucide-react';
import { Agent } from '@/types/agent';
import { getAgentStatus } from '@/lib/api';
import { useState } from 'react';

interface AgentNodeProps {
  agent: Agent;
  x: number;
  y: number;
  onMouseDown?: (e: React.MouseEvent) => void;
  isDragging?: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export function AgentNode({ agent, x, y, onMouseDown, isDragging, canvasWidth, canvasHeight }: AgentNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const status = getAgentStatus(agent.last_seen, agent.sleep_time ?? 3);
  const isOnline = status === 'online';

  const statusColor = isOnline ? '#10B981' : '#EF4444'; // green-500 : red-500
  const bgColor = 'rgba(31, 41, 55, 0.6)'; // semi-transparent gray-800
  const statusGlow = isOnline ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';

  // Smart tooltip positioning based on agent location
  const isTopHalf = y < canvasHeight / 2;

  // Calculate tooltip position to keep it within canvas bounds
  const tooltipWidth = 160;
  const tooltipHeight = 120; // Increased to 120 to prevent status badge clipping
  const tooltipPadding = 10;

  let tooltipX = x - tooltipWidth / 2; // Center by default
  let tooltipY = isTopHalf ? y + 50 : y - tooltipHeight - 50; // Below if top half, above if bottom half

  // Add vertical boundary detection
  const tooltipBottom = tooltipY + tooltipHeight;
  if (tooltipBottom > canvasHeight - tooltipPadding) {
    // Tooltip would go off bottom - position above node instead
    tooltipY = y - tooltipHeight - 50;
  }

  // Ensure tooltip doesn't go off top either
  if (tooltipY < tooltipPadding) {
    tooltipY = tooltipPadding;
  }

  // Adjust horizontal position if too close to edges
  if (tooltipX < tooltipPadding) {
    tooltipX = tooltipPadding; // Too far left
  } else if (tooltipX + tooltipWidth > canvasWidth - tooltipPadding) {
    tooltipX = canvasWidth - tooltipWidth - tooltipPadding; // Too far right
  }

  return (
    <g
      className="transition-all"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={onMouseDown}
      style={{
        transform: isHovered && !isDragging ? 'scale(1.08)' : 'scale(1)',
        transformOrigin: `${x}px ${y}px`,
        transition: isDragging ? 'none' : 'transform 0.2s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.8 : 1,
      }}
    >
      {/* Consolidated defs for animations and gradients */}
      <defs>
        {/* Badge gradient */}
        {agent.total_commands > 0 && (
          <linearGradient id={`badge-gradient-${agent.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#7C3AED', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#EC4899', stopOpacity: 1 }} />
          </linearGradient>
        )}

        {/* CSS animations */}
        <style>{`
          @keyframes pulse-ring-${agent.id} {
            0% {
              opacity: 0.8;
              transform: scale(1);
            }
            100% {
              opacity: 0;
              transform: scale(1.4);
            }
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

      {/* Pulsing ring for online agents */}
      {isOnline && (
        <>
          <rect
            x={x - 45}
            y={y - 40}
            width="90"
            height="80"
            rx="8"
            fill="none"
            stroke={statusColor}
            strokeWidth="2"
            style={{
              animation: `pulse-ring-${agent.id} 2s ease-out infinite`,
              transformOrigin: `${x}px ${y}px`,
            }}
          />
          <rect
            x={x - 45}
            y={y - 40}
            width="90"
            height="80"
            rx="8"
            fill="none"
            stroke={statusColor}
            strokeWidth="2"
            style={{
              animation: `pulse-ring-${agent.id} 2s ease-out infinite`,
              animationDelay: '1s',
              transformOrigin: `${x}px ${y}px`,
            }}
          />
        </>
      )}

      {/* Glow effect */}
      <rect
        x={x - 45}
        y={y - 40}
        width="90"
        height="80"
        rx="8"
        fill="none"
        stroke={statusColor}
        strokeWidth="1"
        opacity={isHovered ? "0.5" : "0.3"}
        style={{
          filter: `blur(8px)`,
        }}
      />

      {/* Main card background */}
      <rect
        x={x - 45}
        y={y - 40}
        width="90"
        height="80"
        rx="8"
        fill={bgColor}
        stroke={statusColor}
        strokeWidth="2"
        style={{
          filter: isHovered
            ? `drop-shadow(0 8px 16px ${statusGlow}) drop-shadow(0 0 20px ${statusGlow})`
            : `drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
          backdropFilter: 'blur(12px)',
        }}
      />

      {/* Icon */}
      <foreignObject x={x - 15} y={y - 30} width="30" height="30">
        <div className="flex items-center justify-center h-full">
          <Monitor className="w-6 h-6 text-gray-400" />
        </div>
      </foreignObject>

      {/* Hostname (truncated) */}
      <text
        x={x}
        y={y + 10}
        textAnchor="middle"
        className="fill-white text-xs font-semibold"
      >
        {agent.hostname.length > 10
          ? agent.hostname.substring(0, 10) + '...'
          : agent.hostname}
      </text>

      {/* Username */}
      <text
        x={x}
        y={y + 24}
        textAnchor="middle"
        className="fill-gray-400 text-[10px]"
      >
        {agent.user.length > 12
          ? agent.user.substring(0, 12) + '...'
          : agent.user}
      </text>

      {/* Command count badge */}
      {agent.total_commands > 0 && (
        <>
          {/* Badge glow */}
          <rect
            x={x + 20}
            y={y - 38}
            width="22"
            height="14"
            rx="7"
            fill="#7C3AED"
            opacity="0.5"
            style={{
              filter: 'blur(4px)',
            }}
          />
          {/* Badge background with gradient */}
          <rect
            x={x + 20}
            y={y - 38}
            width="22"
            height="14"
            rx="7"
            fill={`url(#badge-gradient-${agent.id})`}
            style={{
              filter: 'drop-shadow(0 2px 4px rgba(124, 58, 237, 0.4))',
            }}
          />
          <text
            x={x + 31}
            y={y - 29}
            textAnchor="middle"
            className="fill-white text-[9px] font-bold"
          >
            {agent.total_commands > 99 ? '99+' : agent.total_commands}
          </text>
        </>
      )}

      {/* Tooltip on hover - positioned smartly to stay within canvas */}
      {isHovered && !isDragging && (
        <foreignObject
          x={tooltipX}
          y={tooltipY}
          width={tooltipWidth}
          height={tooltipHeight}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div className="bg-gray-900/90 backdrop-blur-md border border-white/20 rounded-xl px-3 pt-3 pb-3.5 text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px ${statusGlow}`,
            }}
          >
            <p className="text-white font-semibold mb-1.5 truncate text-sm">{agent.hostname}</p>
            <p className="text-gray-300 truncate mb-0.5">
              <span className="text-gray-500">IP:</span> <span className="font-mono">{agent.ipaddr}</span>
            </p>
            <p className="text-gray-300 truncate mb-0.5">
              <span className="text-gray-500">User:</span> {agent.user}
            </p>
            <p className="text-gray-300 mb-1.5">
              <span className="text-gray-500">Commands:</span> <span className="font-semibold">{agent.total_commands}</span>
            </p>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} style={{
                boxShadow: isOnline ? '0 0 4px #10B981' : '0 0 4px #EF4444'
              }}></span>
              {status.toUpperCase()}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
