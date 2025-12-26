'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAgents, listDirectory, readFile, writeFile, deleteFile as deleteFileAPI, uploadFileForAgent, requestFileFromAgent, downloadFileToAgent, formatBytes, getAgentStatus } from '@/lib/api';
import { Agent } from '@/types/agent';
import { RefreshCw, Upload, Download, FileText, Folder, ChevronRight, Home, ArrowUp, Edit, Trash2, Radio, X, Plus } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import dynamic from 'next/dynamic';

// Dynamically import Monaco editor to avoid SSR issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface FileItem {
  name: string;
  is_directory: boolean;
  size: number;
  path: string;
}

// localStorage keys
const STORAGE_AGENT_DIRS = 'filemanager_agent_directories';
const STORAGE_LAST_AGENT = 'filemanager_last_agent_id';

// Helper functions for localStorage
function getPerAgentDirectories(): Record<number, string> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_AGENT_DIRS);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveAgentDirectory(agentId: number, path: string) {
  if (typeof window === 'undefined') return;
  try {
    const dirs = getPerAgentDirectories();
    dirs[agentId] = path;
    localStorage.setItem(STORAGE_AGENT_DIRS, JSON.stringify(dirs));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

function getLastSelectedAgentId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_LAST_AGENT);
    return stored ? parseInt(stored, 10) : null;
  } catch {
    return null;
  }
}

function saveLastSelectedAgentId(agentId: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_LAST_AGENT, agentId.toString());
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export default function FileManagerPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [currentPath, setCurrentPath] = useState('C:\\');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create file mode state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('Untitled.txt');

  // Delete modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadAgents = useCallback(async () => {
    try {
      const data = await getAgents();
      setAgents(data);
      if (data.length > 0 && !selectedAgent) {
        // Try to restore last selected agent from localStorage
        const lastAgentId = getLastSelectedAgentId();
        const lastAgent = lastAgentId ? data.find(a => a.id === lastAgentId) : null;
        setSelectedAgent(lastAgent || data[0]);
      }
    } catch {
      toast.error('Failed to load agents');
    }
  }, [selectedAgent]);

  const loadDirectory = useCallback(async (path: string) => {
    if (!selectedAgent) return;

    setLoading(true);
    try {
      const items = await listDirectory(selectedAgent.id, path, selectedAgent.sleep_time);
      setFiles(items);
      setSelectedFiles(new Set());
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Restore directory when agent changes
  useEffect(() => {
    if (selectedAgent) {
      const dirs = getPerAgentDirectories();
      const savedPath = dirs[selectedAgent.id];
      if (savedPath) {
        setCurrentPath(savedPath);
      } else {
        setCurrentPath('C:\\');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.id]); // Only run when agent ID changes

  // Persist directory changes to localStorage
  useEffect(() => {
    if (selectedAgent && currentPath) {
      saveAgentDirectory(selectedAgent.id, currentPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.id, currentPath]);

  useEffect(() => {
    if (selectedAgent) {
      loadDirectory(currentPath);
    }
  }, [selectedAgent, currentPath, loadDirectory]);

  function handleSort(column: 'name' | 'size' | 'type') {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  }

  function getSortedFiles() {
    const sorted = [...files].sort((a, b) => {
      // Directories always first
      if (a.is_directory && !b.is_directory) return -1;
      if (!a.is_directory && b.is_directory) return 1;

      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        comparison = a.size - b.size;
      } else if (sortBy === 'type') {
        const getExt = (name: string) => name.split('.').pop() || '';
        comparison = getExt(a.name).localeCompare(getExt(b.name));
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }

  function handleFileClick(file: FileItem) {
    if (file.is_directory) {
      setCurrentPath(file.path);
    }
  }

  function handleSelectFile(path: string) {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  }

  function handleSelectAll() {
    if (selectedFiles.size === files.length) {
      // Deselect all
      setSelectedFiles(new Set());
    } else {
      // Select all
      setSelectedFiles(new Set(files.map(f => f.path)));
    }
  }

  function getBreadcrumbs(): string[] {
    const parts = currentPath.split(/[\\\/]/).filter(Boolean);
    const breadcrumbs: string[] = [];
    let accumulated = '';

    for (const part of parts) {
      accumulated += part + '\\';
      breadcrumbs.push(accumulated);
    }

    return breadcrumbs;
  }

  async function handleEdit(file: FileItem) {
    if (file.is_directory || !selectedAgent) return;

    const toastId = toast.loading('Loading file...');
    try {
      const result = await readFile(selectedAgent.id, file.path);

      // Check if file is binary
      if (result.is_binary) {
        toast.error('Cannot edit binary file', { id: toastId });
        return;
      }

      setEditingFile(file.path);
      setFileContent(result.content);
      setOriginalContent(result.content);
      setModified(false);
      setEditorOpen(true);
      toast.success(`File loaded (${result.encoding})`, { id: toastId });
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to load file', { id: toastId });
    }
  }

  function handleNewFile() {
    if (!selectedAgent) return;

    // Enter create mode
    setIsCreatingFile(true);
    setNewFileName('Untitled.txt');
    setFileContent('');
    setOriginalContent('');
    setModified(false);
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!selectedAgent) return;

    setSaving(true);
    const toastId = toast.loading('Saving file...');

    try {
      let filePath: string;

      if (isCreatingFile) {
        // Validate filename
        const trimmedName = newFileName.trim();
        if (!trimmedName) {
          toast.error('Filename cannot be empty', { id: toastId });
          setSaving(false);
          return;
        }

        // Check for invalid characters (Windows-compatible)
        const invalidChars = /[<>:"|?*]/;
        if (invalidChars.test(trimmedName)) {
          toast.error('Filename contains invalid characters: < > : " | ? *', { id: toastId });
          setSaving(false);
          return;
        }

        // Build full path: currentPath + "/" + filename
        filePath = currentPath === '/'
          ? `/${trimmedName}`
          : `${currentPath}/${trimmedName}`;

        // Check if file already exists in directory
        const existingFile = files.find(f => f.name === trimmedName && !f.is_directory);
        if (existingFile) {
          toast.error(`File "${trimmedName}" already exists`, { id: toastId });
          setSaving(false);
          return;
        }
      } else {
        // Editing existing file
        if (!editingFile) return;
        filePath = editingFile;
      }

      // Call writeFile API (works for both create and edit)
      await writeFile(selectedAgent.id, filePath, fileContent);

      setOriginalContent(fileContent);
      setModified(false);
      toast.success(isCreatingFile ? 'File created successfully' : 'File saved successfully', { id: toastId });

      // For new files: close editor and refresh directory
      if (isCreatingFile) {
        setEditorOpen(false);
        setIsCreatingFile(false);
      }

      loadDirectory(currentPath); // Refresh to show new/updated file

    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to save file', { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  function handleEditorChange(value: string | undefined) {
    const newContent = value || '';
    setFileContent(newContent);
    setModified(newContent !== originalContent);
  }

  function handleCloseEditor() {
    if (modified) {
      if (!confirm('You have unsaved changes. Close anyway?')) {
        return;
      }
    }
    setEditorOpen(false);
    setEditingFile(null);
    setFileContent('');
    setOriginalContent('');
    setModified(false);

    // Reset create mode
    setIsCreatingFile(false);
    setNewFileName('Untitled.txt');
  }

  async function handleDelete(file: FileItem) {
    setFileToDelete(file);
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!selectedAgent || !fileToDelete) return;

    setDeleteConfirmOpen(false);
    const toastId = toast.loading('Deleting...');
    try {
      await deleteFileAPI(selectedAgent.id, fileToDelete.path, fileToDelete.is_directory, selectedAgent.sleep_time);
      toast.success('Deleted successfully', { id: toastId });
      loadDirectory(currentPath);
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to delete', { id: toastId });
    } finally {
      setFileToDelete(null);
    }
  }

  async function handleUpload() {
    // Reset upload state when opening modal
    setUploadFiles([]);
    setUploadModalOpen(true);
  }

  function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = e.target.files;
    if (newFiles && newFiles.length > 0) {
      // Only update if files were actually selected (not canceled)
      // Extract array before state update to avoid FileList reference issues
      const filesArray = Array.from(newFiles);
      setUploadFiles(prev => [...prev, ...filesArray]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }

  function handleRemoveFile(index: number) {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleUploadConfirm() {
    if (!selectedAgent || uploadFiles.length === 0) return;

    setUploading(true);
    const toastId = toast.loading(`Uploading ${uploadFiles.length} file(s) to server...`);

    try {
      // Step 1: Upload files to server storage
      for (const file of uploadFiles) {
        await uploadFileForAgent(selectedAgent.id, file);
      }

      toast.loading(`Pushing files to agent directory...`, { id: toastId });

      // Step 2: Issue download commands to push files to agent's current directory
      for (const file of uploadFiles) {
        const targetPath = currentPath.endsWith('\\')
          ? `${currentPath}${file.name}`
          : `${currentPath}\\${file.name}`;

        await downloadFileToAgent(
          selectedAgent.id,
          file.name,
          targetPath,
          selectedAgent.sleep_time
        );
      }

      toast.success(`${uploadFiles.length} file(s) uploaded successfully`, { id: toastId });

      // Step 3: Refresh directory to show new files
      await loadDirectory(currentPath);

      setUploadModalOpen(false);
      setUploadFiles([]);
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to upload files', { id: toastId });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    if (!selectedAgent || selectedFiles.size === 0) return;

    const toastId = toast.loading(`Downloading ${selectedFiles.size} file(s)...`);

    try {
      for (const filePath of Array.from(selectedFiles)) {
        const file = files.find(f => f.path === filePath);
        if (file && !file.is_directory) {
          await requestFileFromAgent(selectedAgent.id, file.path, undefined, selectedAgent.sleep_time);
        }
      }
      toast.success('Files downloaded to server', { id: toastId });
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to download files', { id: toastId });
    }
  }

  function getLanguageFromFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sh': 'shell',
      'bash': 'shell',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
      'sql': 'sql',
      'yaml': 'yaml',
      'yml': 'yaml',
    };
    return langMap[ext || ''] || 'plaintext';
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <Toaster position="bottom-right" />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">File Manager</h1>

        {/* Agent Selector */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-400">Agent:</label>
          <select
            value={selectedAgent?.id || ''}
            onChange={(e) => {
              const agent = agents.find(a => a.id === parseInt(e.target.value));
              if (agent) {
                saveLastSelectedAgentId(agent.id);
                setSelectedAgent(agent);
              } else {
                setSelectedAgent(null);
              }
            }}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
            disabled={agents.length === 0}
          >
            {agents.length === 0 ? (
              <option value="">No agents available</option>
            ) : (
              agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.hostname} ({agent.user})
                </option>
              ))
            )}
          </select>
          {selectedAgent && (
            <span className={`text-xs px-2 py-1 rounded ${getAgentStatus(selectedAgent.last_seen, selectedAgent.sleep_time) === 'online' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              {getAgentStatus(selectedAgent.last_seen, selectedAgent.sleep_time)}
            </span>
          )}
        </div>
      </div>

      {/* Empty State - No Agents */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <Radio className="w-16 h-16 text-gray-600 mb-4" />
          <h2 className="text-2xl font-bold mb-2">No Agents Connected</h2>
          <p className="text-gray-400 mb-6 max-w-md">
            No agents are currently connected to the server.
            <br />
            To use the File Manager, you need to connect an agent first.
          </p>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md text-left mb-6">
            <h3 className="font-semibold mb-3">How to connect an agent:</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
              <li>Start an agent on a target machine</li>
              <li>Connect it to this server (check Terminal or Agents page)</li>
              <li>Return to this page and refresh</li>
            </ol>
          </div>
          <button
            onClick={loadAgents}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Agents
          </button>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4 flex gap-2">
        <button
          onClick={() => loadDirectory(currentPath)}
          disabled={loading}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={handleNewFile}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New File
        </button>
        <button
          onClick={handleUpload}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
        <button
          onClick={handleDownload}
          disabled={selectedFiles.size === 0}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Download ({selectedFiles.size})
        </button>
      </div>

      {/* Selected Files Panel */}
      {selectedFiles.size > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-300">
              {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedFiles(new Set())}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedFiles).map((filePath) => {
              const file = files.find(f => f.path === filePath);
              const fileName = file?.name || filePath.split(/[\\\/]/).pop() || filePath;
              return (
                <div
                  key={filePath}
                  className="bg-gray-800 rounded px-2 py-1 flex items-center gap-2 text-sm"
                >
                  <FileText className="w-3 h-3 text-gray-400" />
                  <span className="text-gray-200">{fileName}</span>
                  <button
                    onClick={() => handleSelectFile(filePath)}
                    className="text-gray-400 hover:text-red-400"
                    title="Deselect"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4 flex items-center gap-2 text-sm overflow-x-auto">
        <button
          onClick={() => setCurrentPath('C:\\')}
          className="hover:text-blue-400 flex items-center gap-1"
        >
          <Home className="w-4 h-4" />
        </button>
        {getBreadcrumbs().map((crumb, i) => (
          <div key={i} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-gray-500" />
            <button
              onClick={() => setCurrentPath(crumb)}
              className="hover:text-blue-400"
            >
              {crumb.split(/[\\\/]/).filter(Boolean).pop()}
            </button>
          </div>
        ))}
        {currentPath !== 'C:\\' && (
          <>
            <div className="flex-1"></div>
            <button
              onClick={() => {
                const parts = currentPath.split(/[\\\/]/).filter(Boolean);
                parts.pop();
                setCurrentPath(parts.length > 0 ? parts.join('\\') + '\\' : 'C:\\');
              }}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1 text-xs"
            >
              <ArrowUp className="w-3 h-3" />
              Parent
            </button>
          </>
        )}
      </div>

      {/* File List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="p-3 text-left w-8">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={files.length > 0 && selectedFiles.size === files.length}
                  onChange={handleSelectAll}
                  title="Select all"
                />
              </th>
              <th
                className="p-3 text-left cursor-pointer hover:bg-gray-600"
                onClick={() => handleSort('name')}
              >
                Name {sortBy === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th
                className="p-3 text-left cursor-pointer hover:bg-gray-600 w-32"
                onClick={() => handleSort('size')}
              >
                Size {sortBy === 'size' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th
                className="p-3 text-left cursor-pointer hover:bg-gray-600 w-40"
                onClick={() => handleSort('type')}
              >
                Type {sortBy === 'type' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th className="p-3 text-left w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading...
                </td>
              </tr>
            ) : getSortedFiles().length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  No files found
                </td>
              </tr>
            ) : (
              getSortedFiles().map((file) => (
                <tr
                  key={file.path}
                  className={`border-t border-gray-700 transition-colors ${
                    selectedFiles.has(file.path)
                      ? 'bg-blue-900/30 hover:bg-blue-900/40'
                      : 'hover:bg-gray-700'
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.path)}
                      onChange={() => handleSelectFile(file.path)}
                      className="rounded"
                    />
                  </td>
                  <td
                    className="p-3 cursor-pointer"
                    onClick={() => handleFileClick(file)}
                  >
                    <div className="flex items-center gap-2">
                      {file.is_directory ? (
                        <Folder className="w-4 h-4 text-blue-400" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400" />
                      )}
                      <span>{file.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-400 text-sm">
                    {file.is_directory ? '--' : formatBytes(file.size)}
                  </td>
                  <td className="p-3 text-gray-400 text-sm">
                    {file.is_directory ? 'Folder' : file.name.split('.').pop()?.toUpperCase() || 'File'}
                  </td>
                  <td className="p-3">
                    {!file.is_directory && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(file)}
                          className="p-1 hover:bg-gray-600 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(file)}
                          className="p-1 hover:bg-red-600 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {file.is_directory && (
                      <button
                        onClick={() => handleDelete(file)}
                        className="p-1 hover:bg-red-600 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Status Bar */}
      <div className="mt-4 text-sm text-gray-400">
        {files.length} items ({files.filter(f => f.is_directory).length} folders, {files.filter(f => !f.is_directory).length} files)
        {selectedFiles.size > 0 && selectedFiles.size <= 3 && (
          <span className="text-blue-400">
            {' • Selected: '}
            {Array.from(selectedFiles).map((path, i) => {
              const file = files.find(f => f.path === path);
              const name = file?.name || path.split(/[\\\/]/).pop() || path;
              return i < selectedFiles.size - 1 ? `${name}, ` : name;
            })}
          </span>
        )}
        {selectedFiles.size > 3 && ` • ${selectedFiles.size} files selected`}
      </div>

      {/* Editor Modal */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
            {/* Editor Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5" />
                {isCreatingFile ? (
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500 min-w-[200px]"
                    placeholder="Enter filename..."
                    autoFocus
                  />
                ) : (
                  <span className="font-medium">{editingFile}</span>
                )}
                {modified && <span className="text-yellow-400 text-sm">● Modified</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={(!isCreatingFile && !modified) || saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
                <button
                  onClick={handleCloseEditor}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  ✖ Close
                </button>
              </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language={getLanguageFromFilename(editingFile || '')}
                value={fileContent}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && fileToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">⚠️ Confirm Deletion</h3>
            <p className="mb-4">
              Are you sure you want to delete:
            </p>
            <p className="font-medium mb-4">
              {fileToDelete.name}
            </p>
            <p className="text-yellow-400 text-sm mb-6">
              ⚠️ This action cannot be undone!
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setDeleteConfirmOpen(false); setFileToDelete(null); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Files
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Destination: <span className="text-blue-400 font-mono">{currentPath}</span>
                </p>
              </div>
              <button
                onClick={() => { setUploadModalOpen(false); setUploadFiles([]); }}
                disabled={uploading}
                className="p-1 hover:bg-gray-700 rounded disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* File Input (Hidden) */}
            <input
              id="file-upload-input"
              type="file"
              multiple
              onChange={handleAddFiles}
              className="hidden"
            />

            {/* Add Files Button */}
            <label
              htmlFor="file-upload-input"
              className="block mb-4 cursor-pointer"
            >
              <div className="border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg p-6 text-center transition-colors">
                <Plus className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-300 mb-1">Click to browse files</p>
                <p className="text-xs text-gray-500">or select multiple files</p>
              </div>
            </label>

            {/* File List */}
            {uploadFiles.length > 0 ? (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-400">
                    Selected Files ({uploadFiles.length})
                  </p>
                  <p className="text-sm text-gray-400">
                    Total: {formatBytes(uploadFiles.reduce((sum, f) => sum + f.size, 0))}
                  </p>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 bg-gray-900 rounded-lg p-3">
                  {uploadFiles.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-800 rounded p-2 hover:bg-gray-750"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(i)}
                        disabled={uploading}
                        className="p-1 hover:bg-red-600 rounded disabled:opacity-50 flex-shrink-0 ml-2"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 text-center py-8 text-gray-500 text-sm">
                No files selected yet
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setUploadModalOpen(false); setUploadFiles([]); }}
                disabled={uploading}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadConfirm}
                disabled={uploadFiles.length === 0 || uploading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading...' : `Upload ${uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
