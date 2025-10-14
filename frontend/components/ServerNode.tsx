import { Server } from 'lucide-react';

interface ServerNodeProps {
  x: number;
  y: number;
  agentCount: number;
  onMouseDown?: (e: React.MouseEvent) => void;
  isDragging?: boolean;
}

export function ServerNode({ x, y, agentCount, onMouseDown, isDragging }: ServerNodeProps) {
  return (
    <g
      className="transition-transform hover:scale-105"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.8 : 1,
      }}
      onMouseDown={onMouseDown}
    >
      {/* Main server box */}
      <rect
        x={x - 60}
        y={y - 50}
        width="120"
        height="100"
        rx="8"
        className="fill-gray-900 stroke-red-600 stroke-2"
      />

      {/* Icon */}
      <foreignObject x={x - 20} y={y - 35} width="40" height="40">
        <div className="flex items-center justify-center h-full">
          <Server className="w-8 h-8 text-red-500" />
        </div>
      </foreignObject>

      {/* Label */}
      <text
        x={x}
        y={y + 10}
        textAnchor="middle"
        className="fill-white text-sm font-bold"
      >
        C2 SERVER
      </text>

      {/* Agent count */}
      <text
        x={x}
        y={y + 30}
        textAnchor="middle"
        className="fill-gray-400 text-xs"
      >
        {agentCount} agent{agentCount !== 1 ? 's' : ''}
      </text>
    </g>
  );
}
