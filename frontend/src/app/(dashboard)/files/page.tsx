'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAgents,
  listAgentFiles,
  downloadFile,
  formatBytes,
} from '@/lib/api';
import { Agent, FileInfo } from '@/types/agent';
import {
  Download,
  File,
  Folder,
  Loader2,
  Trash2,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function FilesPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileInfo | null>(null);

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

  const fetchFiles = useCallback(async () => {
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
  }, [selectedAgent]);

  useEffect(() => {
    if (selectedAgent) {
      fetchFiles();
    }
  }, [selectedAgent, fetchFiles]);

  const handleDeleteFile = async (file: FileInfo) => {
    setFileToDelete(file);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedAgent || !fileToDelete) return;

    setDeleteConfirmOpen(false);
    const toastId = toast.loading('Deleting file from server...');

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/files/${selectedAgent}/${fileToDelete.filename}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      toast.success('File deleted successfully', { id: toastId });
      fetchFiles(); // Refresh file list
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast.error('Failed to delete file', { id: toastId });
    } finally {
      setFileToDelete(null);
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
      <Toaster position="bottom-right" />
      <h1 className="text-3xl font-bold mb-6">Downloads</h1>
      <p className="text-gray-400 mb-6">Files downloaded from agents to the server</p>

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
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold">
                  Downloads from Agent {selectedAgent}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Download files to your PC or delete them from server storage
                </p>
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
                  <p>No files downloaded from this agent yet</p>
                  <p className="text-sm mt-2">
                    Use File Manager to download files from the agent
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
                          Download to PC
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm transition-colors"
                          title="Delete from server"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && fileToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Confirm Deletion
            </h3>
            <p className="mb-4 text-gray-300">
              Are you sure you want to delete this file from the server?
            </p>
            <p className="font-medium mb-2 text-white">
              {fileToDelete.filename}
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Size: {formatBytes(fileToDelete.size)}
            </p>
            <p className="text-yellow-400 text-sm mb-6 flex items-center gap-2">
              ⚠️ This action cannot be undone!
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setFileToDelete(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
