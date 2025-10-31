'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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

  // Animation state
  const [mountedNodes, setMountedNodes] = useState<Set<number>>(new Set());
  const [serverMounted, setServerMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Refs to track current state without triggering effect dependencies
  const nodePositionsRef = useRef(nodePositions);
  const serverPositionRef = useRef(serverPosition);

  // Check for prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    nodePositionsRef.current = nodePositions;
    serverPositionRef.current = serverPosition;
  });

  // Memoize agent IDs to prevent unnecessary effect re-runs
  const agentIds = useMemo(() => agents.map(a => a.id).sort().join(','), [agents]);

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

  // Entrance animations with staggered timing
  useEffect(() => {
    const currentAgentIds = new Set(agents.map(a => a.id));
    const currentMounted = new Set(mountedNodes);

    // Find new agents that aren't mounted yet
    const newAgentIds = agents.filter(a => !currentMounted.has(a.id));

    // Remove mounted nodes for agents that no longer exist
    for (const id of currentMounted) {
      if (!currentAgentIds.has(id)) {
        currentMounted.delete(id);
      }
    }

    // If no new agents, just clean up and return
    if (newAgentIds.length === 0) {
      if (currentMounted.size !== mountedNodes.size) {
        setMountedNodes(currentMounted);
      }
      return;
    }

    // If reduced motion is preferred, show everything immediately
    if (prefersReducedMotion) {
      setServerMounted(true);
      setMountedNodes(currentAgentIds);
      return;
    }

    // Mount server first if not already mounted
    const timers: NodeJS.Timeout[] = [];
    if (!serverMounted) {
      const serverTimer = setTimeout(() => {
        setServerMounted(true);
      }, 100);
      timers.push(serverTimer);
    }

    // Mount only new agents with staggered delays
    newAgentIds.forEach((agent, index) => {
      const delay = serverMounted ? index * 100 : 200 + index * 100;
      const timer = setTimeout(() => {
        setMountedNodes(prev => {
          const newSet = new Set(prev);
          newSet.add(agent.id);
          return newSet;
        });
      }, delay);
      timers.push(timer);
    });

    // Cleanup timers on unmount or when dependencies change
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentIds, prefersReducedMotion]);

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
    <div ref={containerRef} className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700/50 relative overflow-hidden shadow-2xl">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <h2 className="text-xl font-semibold text-white">Network Topology</h2>
          <p className="text-sm text-gray-400">
            C2 Server connected to {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetLayout}
            className="p-2 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-lg transition-all duration-300 border border-white/10 hover:border-white/20 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
            title="Reset layout"
          >
            <RotateCcw className="w-5 h-5 text-gray-300 hover:text-white transition-colors" />
          </button>
          <button
            onClick={onRefresh}
            className="p-2 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-lg transition-all duration-300 border border-white/10 hover:border-white/20 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
            title="Refresh topology"
          >
            <RefreshCw className="w-5 h-5 text-gray-300 hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full relative z-10 rounded-lg"
        overflow="visible"
        style={{
          minHeight: '500px',
          cursor: draggingNode ? 'grabbing' : 'default',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.4) 0%, rgba(31, 41, 55, 0.4) 100%)',
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
            @keyframes fadeInScale {
              from {
                opacity: 0;
                transform: scale(0.8);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
            @keyframes drawLine {
              from {
                stroke-dashoffset: 1000;
              }
              to {
                stroke-dashoffset: 0;
              }
            }

            /* Disable animations for users who prefer reduced motion */
            @media (prefers-reduced-motion: reduce) {
              * {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
              }
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
        <g
          style={{
            animation: serverMounted && !prefersReducedMotion ? 'fadeInScale 0.5s ease-out forwards' : 'none',
            opacity: serverMounted ? 1 : 0,
            transformOrigin: `${currentServerPos.x}px ${currentServerPos.y}px`,
          }}
        >
          <ServerNode
            x={currentServerPos.x}
            y={currentServerPos.y}
            agentCount={agents.length}
            onMouseDown={(e) => handleMouseDown(e, 'server')}
            isDragging={draggingNode?.type === 'server'}
          />
        </g>

        {/* Agent nodes */}
        {agents.map((agent, index) => {
          const agentPos = getAgentPos(agent.id, index);
          const isMounted = mountedNodes.has(agent.id);

          return (
            <g
              key={`agent-wrapper-${agent.id}`}
              style={{
                animation: isMounted && !prefersReducedMotion ? 'fadeInScale 0.5s ease-out forwards' : 'none',
                opacity: isMounted ? 1 : 0,
                transformOrigin: `${agentPos.x}px ${agentPos.y}px`,
              }}
            >
              <AgentNode
                key={`agent-${agent.id}`}
                agent={agent}
                x={agentPos.x}
                y={agentPos.y}
                onMouseDown={(e) => handleMouseDown(e, 'agent', agent.id)}
                isDragging={draggingNode?.type === 'agent' && draggingNode?.id === agent.id}
                canvasWidth={dimensions.width}
                canvasHeight={dimensions.height}
              />
            </g>
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
      <div className="mt-4 flex items-center gap-6 text-sm text-gray-400 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg px-4 py-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50"></div>
          <span>Online</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50"></div>
          <span>Offline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-green-500 shadow-lg shadow-green-500/50"></div>
          <span>Active Connection</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-600 shadow-lg shadow-purple-600/50"></div>
          <span>Command Count</span>
        </div>
      </div>
    </div>
  );
}
