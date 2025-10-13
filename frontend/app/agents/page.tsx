'use client';

import { useEffect, useState } from 'react';
import { getAgents, getAgentStatus, formatDate } from '@/lib/api';
import { Agent } from '@/types/agent';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');

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
    const interval = setInterval(fetchAgents, 3000);

    return () => clearInterval(interval);
  }, []);

  const filteredAgents = agents.filter((agent) => {
    if (filter === 'all') return true;
    const status = getAgentStatus(agent.last_seen);
    return status === filter;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Agents</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'all'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            All ({agents.length})
          </button>
          <button
            onClick={() => setFilter('online')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'online'
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Online (
            {agents.filter((a) => getAgentStatus(a.last_seen) === 'online').length})
          </button>
          <button
            onClick={() => setFilter('offline')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'offline'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Offline (
            {agents.filter((a) => getAgentStatus(a.last_seen) === 'offline').length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400">Loading agents...</div>
      ) : filteredAgents.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-8 border border-gray-800 text-center">
          <p className="text-gray-400">
            {filter === 'all'
              ? 'No agents connected yet.'
              : `No ${filter} agents found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => {
            const status = getAgentStatus(agent.last_seen);
            return (
              <div
                key={agent.id}
                className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-gray-700 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`}
                    />
                    <div>
                      <h3 className="font-semibold text-lg">{agent.hostname}</h3>
                      <p className="text-sm text-gray-400">ID: {agent.id}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      status === 'online'
                        ? 'bg-green-900 text-green-300'
                        : 'bg-red-900 text-red-300'
                    }`}
                  >
                    {status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">User:</span>
                    <span className="text-white font-mono">{agent.user}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">IP Address:</span>
                    <span className="text-white font-mono">{agent.ipaddr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Last Seen:</span>
                    <span className="text-white">{formatDate(agent.last_seen)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Joined:</span>
                    <span className="text-white">{formatDate(agent.joined_at)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
                  <div className="bg-gray-800 rounded p-2 text-center">
                    <p className="text-gray-400">Commands</p>
                    <p className="text-white font-bold">{agent.total_commands}</p>
                  </div>
                  <div className="bg-gray-800 rounded p-2 text-center">
                    <p className="text-gray-400">Uploads</p>
                    <p className="text-white font-bold">{agent.uploaded_files_count}</p>
                  </div>
                  <div className="bg-gray-800 rounded p-2 text-center">
                    <p className="text-gray-400">Downloads</p>
                    <p className="text-white font-bold">{agent.downloaded_files_count}</p>
                  </div>
                </div>

                <Link
                  href={`/terminal?agent=${agent.id}`}
                  className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Open Terminal
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
