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
}

export function AgentNode({ agent, x, y, onMouseDown, isDragging }: AgentNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const status = getAgentStatus(agent.last_seen);
  const isOnline = status === 'online';

  const statusColor = isOnline ? '#10B981' : '#EF4444'; // green-500 : red-500
  const bgColor = '#1F2937'; // gray-800

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
      {/* Main card background */}
      <rect
        x={x - 45}
        y={y - 40}
        width="90"
        height="80"
        rx="6"
        fill={bgColor}
        stroke={statusColor}
        strokeWidth="2"
        style={{
          filter: isHovered ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'none',
        }}
      />

      {/* Status indicator */}
      <circle
        cx={x - 35}
        cy={y - 30}
        r="4"
        fill={statusColor}
        style={{
          animation: isOnline ? 'pulse 2s ease-in-out infinite' : 'none',
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
          <rect
            x={x + 20}
            y={y - 38}
            width="22"
            height="14"
            rx="7"
            fill="#7C3AED" // purple-600
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

      {/* Tooltip on hover */}
      {isHovered && (
        <foreignObject x={x - 80} y={y + 50} width="160" height="80">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs shadow-xl">
            <p className="text-white font-semibold mb-1">{agent.hostname}</p>
            <p className="text-gray-400">
              <span className="text-gray-500">IP:</span> {agent.ipaddr}
            </p>
            <p className="text-gray-400">
              <span className="text-gray-500">User:</span> {agent.user}
            </p>
            <p className="text-gray-400">
              <span className="text-gray-500">Commands:</span> {agent.total_commands}
            </p>
            <p className={`text-xs mt-1 ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
              ● {status.toUpperCase()}
            </p>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
