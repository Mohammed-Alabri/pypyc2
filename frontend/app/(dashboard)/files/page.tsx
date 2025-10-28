'use client';

import { useEffect, useState } from 'react';
import {
  getAgents,
  listAgentFiles,
  uploadFileForAgent,
  downloadFile,
  createUploadCommand,
  createDownloadCommand,
  formatBytes,
} from '@/lib/api';
import { Agent, FileInfo } from '@/types/agent';
import {
  Upload,
  Download,
  File,
  Folder,
  ArrowUpFromLine,
  ArrowDownToLine,
  Loader2,
} from 'lucide-react';

export default function FilesPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await getAgents();
        setAgents(data);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchFiles();
    }
  }, [selectedAgent]);

  const fetchFiles = async () => {
    if (!selectedAgent) return;

    setLoading(true);
    try {
      const data = await listAgentFiles(selectedAgent);
      setFiles(data.files);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFileToServer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAgent || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploadLoading(true);

    try {
      await uploadFileForAgent(selectedAgent, file);
      alert(`File "${file.name}" uploaded successfully!`);
      fetchFiles();
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert(`Failed to upload file: ${error}`);
    } finally {
      setUploadLoading(false);
      e.target.value = '';
    }
  };

  const handleRequestFileFromAgent = async () => {
    if (!selectedAgent) return;

    const path = prompt('Enter the file path on the agent to upload:');
    if (!path) return;

    try {
      const response = await createUploadCommand(selectedAgent, path) as { message?: string };
      alert(response.message || 'Upload command sent to agent');
    } catch (error) {
      console.error('Failed to create upload command:', error);
      alert(`Failed: ${error}`);
    }
  };

  const handleSendFileToAgent = async (filename: string) => {
    if (!selectedAgent) return;

    const savePath = prompt(
      'Enter the path where the agent should save the file:',
      filename
    );
    if (!savePath) return;

    try {
      const response = await createDownloadCommand(selectedAgent, filename, savePath) as { message?: string };
      alert(response.message || 'Download command sent to agent');
    } catch (error) {
      console.error('Failed to create download command:', error);
      alert(`Failed: ${error}`);
    }
  };

  const handleDownloadFile = async (filename: string) => {
    if (!selectedAgent) return;

    try {
      const blob = await downloadFile(`agent_${selectedAgent}`, filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert(`Failed to download file: ${error}`);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">File Manager</h1>

      <div className="flex gap-6">
        {/* Agent Selector */}
        <div className="w-64 bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="font-semibold mb-4">Select Agent</h2>
          <div className="space-y-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedAgent === agent.id
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <p className="font-semibold text-sm">{agent.hostname}</p>
                <p className="text-xs opacity-70">ID: {agent.id}</p>
                <p className="text-xs opacity-70 mt-1">
                  {agent.uploaded_files_count} files
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* File Manager */}
        <div className="flex-1 bg-gray-900 rounded-lg p-6 border border-gray-800">
          {!selectedAgent ? (
            <div className="text-center text-gray-400 py-12">
              <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select an agent to view files</p>
            </div>
          ) : (
            <>
              {/* Actions */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  Files for Agent {selectedAgent}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleRequestFileFromAgent}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    Request from Agent
                  </button>
                  <label className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {uploadLoading ? 'Uploading...' : 'Upload to Server'}
                    <input
                      type="file"
                      onChange={handleUploadFileToServer}
                      className="hidden"
                      disabled={uploadLoading}
                    />
                  </label>
                </div>
              </div>

              {/* File List */}
              {loading ? (
                <div className="text-center text-gray-400 py-12">
                  <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                  <p>Loading files...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <File className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No files found for this agent</p>
                  <p className="text-sm mt-2">
                    Upload files or request them from the agent
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <File className="w-5 h-5 text-blue-400" />
                        <div>
                          <p className="font-semibold">{file.filename}</p>
                          <p className="text-sm text-gray-400">
                            {formatBytes(file.size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownloadFile(file.filename)}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition-colors"
                          title="Download to your computer"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                        <button
                          onClick={() => handleSendFileToAgent(file.filename)}
                          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm transition-colors"
                          title="Send to agent"
                        >
                          <ArrowDownToLine className="w-4 h-4" />
                          Send to Agent
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
