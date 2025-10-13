'use client';

import { useEffect, useState } from 'react';
import { getAgents, getAgentStatus } from '@/lib/api';
import { Agent } from '@/types/agent';
import { Users, Activity, Command, HardDrive } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await getAgents();
        setAgents(data);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const onlineAgents = agents.filter(a => getAgentStatus(a.last_seen) === 'online');
  const totalCommands = agents.reduce((sum, a) => sum + a.total_commands, 0);
  const totalFiles = agents.reduce((sum, a) => sum + a.uploaded_files_count, 0);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Agents</p>
              <p className="text-3xl font-bold mt-2">{agents.length}</p>
            </div>
            <Users className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Online Agents</p>
              <p className="text-3xl font-bold mt-2 text-green-500">{onlineAgents.length}</p>
            </div>
            <Activity className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Commands</p>
              <p className="text-3xl font-bold mt-2">{totalCommands}</p>
            </div>
            <Command className="w-12 h-12 text-purple-500" />
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Files Uploaded</p>
              <p className="text-3xl font-bold mt-2">{totalFiles}</p>
            </div>
            <HardDrive className="w-12 h-12 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Active Agents List */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Active Agents</h2>
        {loading ? (
          <p className="text-gray-400">Loading agents...</p>
        ) : agents.length === 0 ? (
          <p className="text-gray-400">No agents connected. Waiting for agents to join...</p>
        ) : (
          <div className="space-y-3">
            {agents.slice(0, 5).map((agent) => {
              const status = getAgentStatus(agent.last_seen);
              return (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="flex items-center justify-between p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        status === 'online' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <div>
                      <p className="font-semibold">{agent.hostname}</p>
                      <p className="text-sm text-gray-400">
                        {agent.user} @ {agent.ipaddr}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-400">
                    <p>ID: {agent.id}</p>
                    <p>{agent.total_commands} commands</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {agents.length > 5 && (
          <Link
            href="/agents"
            className="block text-center mt-4 text-blue-400 hover:text-blue-300"
          >
            View all {agents.length} agents →
          </Link>
        )}
      </div>
    </div>
  );
}
