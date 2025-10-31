import { getAgentStatus } from '@/lib/api';

interface ConnectionLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isOnline: boolean;
  agentId: number;
}

export function ConnectionLine({ x1, y1, x2, y2, isOnline, agentId }: ConnectionLineProps) {
  const lineColor = isOnline ? '#10B981' : '#4B5563'; // green-500 : gray-600
  const gradientId = `line-gradient-${agentId}`;
  const glowId = `line-glow-${agentId}`;

  return (
    <g>
      {/* Define gradient from server (red) to agent (status color) */}
      <defs>
        <linearGradient id={gradientId} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: '#DC2626', stopOpacity: isOnline ? 0.8 : 0.4 }} />
          <stop offset="100%" style={{ stopColor: lineColor, stopOpacity: isOnline ? 0.8 : 0.4 }} />
        </linearGradient>
        {/* Glow filter */}
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {isOnline && (
          <style>{`
            @keyframes dash-${agentId} {
              to {
                stroke-dashoffset: -24;
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
        )}
      </defs>

      {/* Glow line */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lineColor}
        strokeWidth="4"
        opacity={isOnline ? 0.3 : 0.15}
        style={{
          filter: 'blur(6px)',
        }}
      />

      {/* Main connection line with gradient */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        strokeDasharray={isOnline ? '8, 4' : '4, 4'}
        strokeLinecap="round"
        style={isOnline ? {
          animation: `dash-${agentId} 1s linear infinite`,
        } : undefined}
      />
    </g>
  );
}
