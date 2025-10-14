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

  return (
    <g>
      {/* Main connection line */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lineColor}
        strokeWidth="2"
        strokeDasharray={isOnline ? '8, 4' : '0'}
        opacity={isOnline ? 0.6 : 0.3}
      />

      {/* Shadow line for depth */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#000"
        strokeWidth="2"
        opacity="0.3"
        transform="translate(2, 2)"
      />
    </g>
  );
}
