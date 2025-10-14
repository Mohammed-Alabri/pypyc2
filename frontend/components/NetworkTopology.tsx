'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Agent } from '@/types/agent';
import { getAgentStatus } from '@/lib/api';
import { ServerNode } from './ServerNode';
import { AgentNode } from './AgentNode';
import { ConnectionLine } from './ConnectionLine';
import { RefreshCw, RotateCcw } from 'lucide-react';

interface NetworkTopologyProps {
  agents: Agent[];
  onRefresh?: () => void;
}

interface Position {
  x: number;
  y: number;
}

interface DraggingNode {
  type: 'server' | 'agent';
  id?: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

export function NetworkTopology({ agents, onRefresh }: NetworkTopologyProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Drag state
  const [nodePositions, setNodePositions] = useState<Map<number, Position>>(new Map());
  const [serverPosition, setServerPosition] = useState<Position | null>(null);
  const [draggingNode, setDraggingNode] = useState<DraggingNode | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Refs to track current state without triggering effect dependencies
  const nodePositionsRef = useRef(nodePositions);
  const serverPositionRef = useRef(serverPosition);

  // Keep refs in sync with state
  useEffect(() => {
    nodePositionsRef.current = nodePositions;
    serverPositionRef.current = serverPosition;
  });

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(width, 600),
          height: Math.max(500, Math.min(width * 0.75, 700)),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Initialize positions when agents change or dimensions change
  useEffect(() => {
    const defaultServerPos: Position = {
      x: dimensions.width / 2,
      y: dimensions.height / 3,
    };

    // Initialize server position if not set or if dimensions changed significantly
    const currentServerPos = serverPositionRef.current;
    if (!currentServerPos || Math.abs(currentServerPos.x - defaultServerPos.x) > 50) {
      setServerPosition(defaultServerPos);
    }

    // Initialize agent positions for new agents
    const currentPositions = nodePositionsRef.current;
    const newPositions = new Map(currentPositions);
    let hasNewAgents = false;

    agents.forEach((agent, index) => {
      if (!newPositions.has(agent.id)) {
        const radius = Math.min(dimensions.width, dimensions.height) * 0.28;
        const angleStep = (2 * Math.PI) / Math.max(agents.length, 3);
        const angle = index * angleStep - Math.PI / 2;

        newPositions.set(agent.id, {
          x: defaultServerPos.x + radius * Math.cos(angle),
          y: defaultServerPos.y + radius * Math.sin(angle) + dimensions.height * 0.15,
        });
        hasNewAgents = true;
      }
    });

    // Remove positions for agents that no longer exist
    const currentAgentIds = new Set(agents.map(a => a.id));
    for (const id of newPositions.keys()) {
      if (!currentAgentIds.has(id)) {
        newPositions.delete(id);
        hasNewAgents = true;
      }
    }

    if (hasNewAgents) {
      setNodePositions(newPositions);
    }
  }, [agents, dimensions]);

  // Get current positions (use custom positions if set, otherwise calculate defaults)
  const getServerPos = (): Position => {
    return serverPosition || {
      x: dimensions.width / 2,
      y: dimensions.height / 3,
    };
  };

  const getAgentPos = (agentId: number, index: number): Position => {
    const customPos = nodePositions.get(agentId);
    if (customPos) return customPos;

    // Fallback to calculated position
    const serverPos = getServerPos();
    const radius = Math.min(dimensions.width, dimensions.height) * 0.28;
    const angleStep = (2 * Math.PI) / Math.max(agents.length, 3);
    const angle = index * angleStep - Math.PI / 2;

    return {
      x: serverPos.x + radius * Math.cos(angle),
      y: serverPos.y + radius * Math.sin(angle) + dimensions.height * 0.15,
    };
  };

  // Convert screen coordinates to SVG coordinates
  const screenToSVG = (screenX: number, screenY: number): Position => {
    if (!svgRef.current) return { x: screenX, y: screenY };

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.viewBox.baseVal.width / rect.width || 1;
    const scaleY = svg.viewBox.baseVal.height / rect.height || 1;

    return {
      x: (screenX - rect.left) * scaleX,
      y: (screenY - rect.top) * scaleY,
    };
  };

  // Mouse event handlers
  const handleMouseDown = (
    e: React.MouseEvent,
    type: 'server' | 'agent',
    id?: number
  ) => {
    e.stopPropagation();

    const svgCoords = screenToSVG(e.clientX, e.clientY);
    const currentPos = type === 'server'
      ? getServerPos()
      : (id !== undefined ? getAgentPos(id, agents.findIndex(a => a.id === id)) : { x: 0, y: 0 });

    setDraggingNode({
      type,
      id,
      startX: svgCoords.x,
      startY: svgCoords.y,
      offsetX: svgCoords.x - currentPos.x,
      offsetY: svgCoords.y - currentPos.y,
    });
    setIsDragging(false); // Reset dragging flag
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingNode) return;

    const svgCoords = screenToSVG(e.clientX, e.clientY);

    // Calculate distance moved to determine if this is a drag
    const distanceMoved = Math.sqrt(
      Math.pow(svgCoords.x - draggingNode.startX, 2) +
      Math.pow(svgCoords.y - draggingNode.startY, 2)
    );

    // Consider it a drag if moved more than 5 pixels
    if (distanceMoved > 5) {
      setIsDragging(true);
    }

    const newX = svgCoords.x - draggingNode.offsetX;
    const newY = svgCoords.y - draggingNode.offsetY;

    // Boundary detection (keep nodes within canvas with padding)
    const padding = 60;
    const boundedX = Math.max(padding, Math.min(dimensions.width - padding, newX));
    const boundedY = Math.max(padding, Math.min(dimensions.height - padding, newY));

    if (draggingNode.type === 'server') {
      setServerPosition({ x: boundedX, y: boundedY });
    } else if (draggingNode.id !== undefined) {
      setNodePositions(prev => {
        const newMap = new Map(prev);
        newMap.set(draggingNode.id!, { x: boundedX, y: boundedY });
        return newMap;
      });
    }
  };

  const handleMouseUp = () => {
    // If we weren't dragging (just a click), handle the click
    if (draggingNode && !isDragging) {
      if (draggingNode.type === 'server') {
        handleServerClick();
      } else if (draggingNode.id !== undefined) {
        handleAgentClick(draggingNode.id);
      }
    }

    setDraggingNode(null);
    setIsDragging(false);
  };

  const handleAgentClick = (agentId: number) => {
    if (!isDragging) {
      router.push(`/agents/${agentId}`);
    }
  };

  const handleServerClick = () => {
    // TODO: Could show server stats modal
  };

  // Reset layout to circular arrangement
  const resetLayout = () => {
    const defaultServerPos: Position = {
      x: dimensions.width / 2,
      y: dimensions.height / 3,
    };

    setServerPosition(defaultServerPos);

    const newPositions = new Map<number, Position>();
    agents.forEach((agent, index) => {
      const radius = Math.min(dimensions.width, dimensions.height) * 0.28;
      const angleStep = (2 * Math.PI) / Math.max(agents.length, 3);
      const angle = index * angleStep - Math.PI / 2;

      newPositions.set(agent.id, {
        x: defaultServerPos.x + radius * Math.cos(angle),
        y: defaultServerPos.y + radius * Math.sin(angle) + dimensions.height * 0.15,
      });
    });

    setNodePositions(newPositions);
  };

  // Optimize: Calculate server position once per render instead of multiple times
  const currentServerPos = getServerPos();

  return (
    <div ref={containerRef} className="bg-gray-900 rounded-lg p-6 border border-gray-800 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Network Topology</h2>
          <p className="text-sm text-gray-400">
            C2 Server connected to {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetLayout}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Reset layout"
          >
            <RotateCcw className="w-5 h-5 text-gray-400" />
          </button>
          <button
            onClick={onRefresh}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh topology"
          >
            <RefreshCw className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full"
        style={{
          minHeight: '500px',
          cursor: draggingNode ? 'grabbing' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Define animations */}
        <defs>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.05); }
            }
          `}</style>
        </defs>

        {/* Connection lines (draw first, so they're behind nodes) */}
        {agents.map((agent, index) => {
          const agentPos = getAgentPos(agent.id, index);
          const isOnline = getAgentStatus(agent.last_seen) === 'online';

          return (
            <ConnectionLine
              key={`line-${agent.id}`}
              x1={currentServerPos.x}
              y1={currentServerPos.y}
              x2={agentPos.x}
              y2={agentPos.y}
              isOnline={isOnline}
              agentId={agent.id}
            />
          );
        })}

        {/* Server node */}
        <ServerNode
          x={currentServerPos.x}
          y={currentServerPos.y}
          agentCount={agents.length}
          onMouseDown={(e) => handleMouseDown(e, 'server')}
          isDragging={draggingNode?.type === 'server'}
        />

        {/* Agent nodes */}
        {agents.map((agent, index) => {
          const agentPos = getAgentPos(agent.id, index);

          return (
            <AgentNode
              key={`agent-${agent.id}`}
              agent={agent}
              x={agentPos.x}
              y={agentPos.y}
              onMouseDown={(e) => handleMouseDown(e, 'agent', agent.id)}
              isDragging={draggingNode?.type === 'agent' && draggingNode?.id === agent.id}
            />
          );
        })}
      </svg>

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-400 text-lg mb-2">No agents connected</p>
            <p className="text-gray-500 text-sm">
              Waiting for agents to join the C2 server...
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span>Online</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Offline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-green-500"></div>
          <span>Active Connection</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-600"></div>
          <span>Command Count</span>
        </div>
      </div>
    </div>
  );
}
