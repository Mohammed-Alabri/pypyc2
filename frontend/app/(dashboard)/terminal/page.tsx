'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getAgents,
  getAgent,
  executeCommand,
  getCommandResult,
  getAgentStatus,
} from '@/lib/api';
import { Agent, AgentDetailed, CommandResult } from '@/types/agent';
import { Terminal as TerminalIcon, Send, Loader2 } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';

function TerminalContent() {
  const searchParams = useSearchParams();
  const selectedAgentId = searchParams.get('agent');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDetailed | null>(null);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<CommandResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializedAgentId, setInitializedAgentId] = useState<number | null>(null);
  const [followOutput, setFollowOutput] = useState(true);
  // Memoized deduplicated history for stable array reference
  const deduplicatedHistory = useMemo(() => {
    const seen = new Set<number>();
    return commandHistory.filter(cmd => {
      if (seen.has(cmd.command_id)) {
        return false;
      }
      seen.add(cmd.command_id);
      return true;
    });
  }, [commandHistory]);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await getAgents();
        setAgents(data);

        if (selectedAgentId) {
          const agentData = await getAgent(Number(selectedAgentId));
          setSelectedAgent(agentData);
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);

    return () => clearInterval(interval);
  }, [selectedAgentId]);

  useEffect(() => {
    if (selectedAgent) {
      // If this is a new agent, initialize history
      if (selectedAgent.id !== initializedAgentId) {
        const completedCommands = selectedAgent.commands.filter(
          (cmd) => cmd.status === 'completed' || cmd.status === 'failed'
        );
        setCommandHistory(completedCommands as CommandResult[]);
        setInitializedAgentId(selectedAgent.id);
      } else {
        // Same agent - merge new commands from server with local history
        const serverCommands = selectedAgent.commands.filter(
          (cmd) => cmd.status === 'completed' || cmd.status === 'failed'
        );

        setCommandHistory((prevHistory) => {
          // Build a set of existing command IDs
          const existingIds = new Set(prevHistory.map(cmd => cmd.command_id));
          // Find new commands from server that aren't in local history
          const newCommands = serverCommands.filter(cmd => !existingIds.has(cmd.command_id));
          // Merge them
          return [...prevHistory, ...newCommands];
        });
      }
    }
  }, [selectedAgent, initializedAgentId]);

  const handleSelectAgent = async (agentId: number) => {
    try {
      const agentData = await getAgent(agentId);
      setSelectedAgent(agentData);
      setCommandHistory([]);
      setInitializedAgentId(null); // Reset to trigger fresh initialization
    } catch (error) {
      console.error('Failed to fetch agent:', error);
    }
  };

  const handleExecuteCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !command.trim() || loading) return;

    setLoading(true);
    try {
      const response = await executeCommand(selectedAgent.id, command) as { command_id: number };
      const commandId = response.command_id;

      // Poll for result (300ms for faster response)
      const pollInterval = setInterval(async () => {
        try {
          const result = await getCommandResult(selectedAgent.id, commandId);
          if (result.status === 'completed' || result.status === 'failed') {
            setCommandHistory((prev) => {
              // Check if command already exists in history
              if (prev.some(cmd => cmd.command_id === result.command_id)) {
                return prev;
              }
              return [...prev, result];
            });

            // Update last_seen to keep status indicator showing as online
            setSelectedAgent(prev => prev ? {
              ...prev,
              last_seen: new Date().toISOString()
            } : null);

            clearInterval(pollInterval);
            setLoading(false);
            setCommand('');
          }
        } catch (error) {
          console.error('Failed to get command result:', error);
        }
      }, 300);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        setLoading(false);
      }, 30000);
    } catch (error) {
      console.error('Failed to execute command:', error);
      setLoading(false);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <h1 className="text-3xl font-bold mb-6">Terminal</h1>

      <div className="flex gap-6 flex-1">
        {/* Agent Selector Sidebar */}
        <div className="w-64 bg-gray-900 rounded-lg p-4 border border-gray-800 overflow-y-auto">
          <h2 className="font-semibold mb-4">Select Agent</h2>
          <div className="space-y-2">
            {agents.map((agent) => {
              const status = getAgentStatus(agent.last_seen);
              const isSelected = selectedAgent?.id === agent.id;

              return (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${isSelected
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                    />
                    <span className="font-semibold text-sm">{agent.hostname}</span>
                  </div>
                  <p className="text-xs opacity-70">ID: {agent.id}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Terminal Area */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 flex flex-col">
          {/* Terminal Header */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TerminalIcon className="w-5 h-5 text-green-500" />
              {selectedAgent ? (
                <div>
                  <p className="font-semibold">
                    {selectedAgent.user}@{selectedAgent.hostname}
                  </p>
                  <p className="text-xs text-gray-400">
                    {selectedAgent.ipaddr} • ID: {selectedAgent.id}
                  </p>
                </div>
              ) : (
                <p className="text-gray-400">No agent selected</p>
              )}
            </div>
            {selectedAgent && (
              <div className="flex items-center gap-3">
                {loading && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded text-xs bg-yellow-900 text-yellow-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Running</span>
                  </div>
                )}
                <div
                  className={`px-3 py-1 rounded text-xs ${getAgentStatus(selectedAgent.last_seen) === 'online'
                      ? 'bg-green-900 text-green-300'
                      : 'bg-red-900 text-red-300'
                    }`}
                >
                  {getAgentStatus(selectedAgent.last_seen).toUpperCase()}
                </div>
              </div>
            )}
          </div>

          {/* Terminal Output */}
          <div className="flex-1 flex flex-col font-mono text-sm bg-black overflow-hidden">
            {!selectedAgent ? (
              <div className="p-4">
                <p className="text-green-500">
                  pypyc2 terminal v1.0.0
                  <br />
                  Select an agent from the sidebar to begin.
                </p>
              </div>
            ) : (
              <>
                <Virtuoso
                  data={deduplicatedHistory}
                  followOutput="smooth"
                  initialTopMostItemIndex={99999999}
                  style={{ flex: 1 }}
                  components={{
                    Header: () => (
                      <div className="px-4 pt-4 pb-0">
                        <p className="text-green-500 mb-4">
                          Connected to {selectedAgent.hostname}
                          <br />
                          Type commands below and press Enter to execute.
                        </p>
                      </div>
                    ),
                    Footer: () => (
                      <div className="pb-1" />
                    )
                  }}
                  itemContent={(_index, cmd) => {
                    // Format command display based on type
                    let commandDisplay = '';
                    if (cmd.type === 'exec' && cmd.data?.command) {
                      commandDisplay = cmd.data.command;
                    } else if (cmd.type === 'upload' && cmd.data?.source_path) {
                      commandDisplay = `upload: ${cmd.data.source_path}`;
                    } else if (cmd.type === 'download' && cmd.data?.filename) {
                      commandDisplay = `download: ${cmd.data.filename} → ${cmd.data.save_as || cmd.data.filename}`;
                    } else {
                      commandDisplay = cmd.type;
                    }

                    return (
                      <div className="px-4 mb-4">
                        <p className="text-blue-400">
                          $ {commandDisplay}
                        </p>
                        {cmd.status === 'completed' ? (
                          <pre className="text-gray-300 whitespace-pre-wrap mt-1">
                            {cmd.result || '(no output)'}
                          </pre>
                        ) : (
                          <pre className="text-red-400 whitespace-pre-wrap mt-1">
                            Error: {cmd.error || 'Command failed'}
                          </pre>
                        )}
                      </div>
                    );
                  }}
                />
              </>
            )}
          </div>

          {/* Command Input */}
          <div className="p-4 border-t border-gray-800">
            <form onSubmit={handleExecuteCommand} className="flex gap-2">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={
                  selectedAgent
                    ? 'Enter command (e.g., whoami, ipconfig)...'
                    : 'Select an agent first...'
                }
                disabled={!selectedAgent || loading}
                className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              />
              <button
                type="submit"
                disabled={!selectedAgent || !command.trim() || loading}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Execute
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading terminal...</div>}>
      <TerminalContent />
    </Suspense>
  );
}
