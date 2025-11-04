'use client';

import { useEffect, useState } from 'react';
import { getAgents, getAgentStatus } from '@/lib/api';
import { Agent } from '@/types/agent';
import { Users, Activity, Command, HardDrive } from 'lucide-react';
import { NetworkTopology } from '@/components/NetworkTopology';

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

  const onlineAgents = agents.filter(a => getAgentStatus(a.last_seen, a.sleep_time ?? 3) === 'online');
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

      {/* Network Topology */}
      {!loading && (
        <NetworkTopology
          agents={agents}
          onRefresh={async () => {
            try {
              const data = await getAgents();
              setAgents(data);
            } catch (error) {
              console.error('Failed to refresh agents:', error);
            }
          }}
        />
      )}
    </div>
  );
}
