'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Folder, File, ChevronRight, ChevronDown, Loader2, HardDrive } from 'lucide-react';
import { listDirectory } from '@/lib/api';

interface FileItem {
  name: string;
  is_directory: boolean;
  size: number;
  path: string;
}

interface TreeNodeProps {
  item: FileItem;
  agentId: number;
  agentSleepTime: number;
  onSelectFile: (path: string) => void;
  level: number;
}

function TreeNode({ item, agentId, agentSleepTime, onSelectFile, level }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (!item.is_directory) {
      onSelectFile(item.path);
      return;
    }

    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    // Load children if not loaded yet
    if (children.length === 0) {
      setIsLoading(true);
      setError(null);
      try {
        const items = await listDirectory(agentId, item.path, agentSleepTime);
        setChildren(items);
        setIsExpanded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directory');
        console.error('Error loading directory:', err);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsExpanded(true);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-700 rounded ${
          !item.is_directory ? 'hover:bg-blue-700' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleToggle}
      >
        {item.is_directory && (
          <div className="w-4 h-4 flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
            ) : isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </div>
        )}
        {!item.is_directory && <div className="w-4" />}

        {item.is_directory ? (
          <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        ) : (
          <File className="w-4 h-4 text-blue-400 flex-shrink-0" />
        )}

        <span className="text-sm text-white truncate flex-1">{item.name}</span>

        {!item.is_directory && item.size > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatBytes(item.size)}
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 px-2 py-1" style={{ paddingLeft: `${level * 16 + 32}px` }}>
          {error}
        </div>
      )}

      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child, index) => (
            <TreeNode
              key={`${child.path}-${index}`}
              item={child}
              agentId={agentId}
              agentSleepTime={agentSleepTime}
              onSelectFile={onSelectFile}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

interface FileTreeModalProps {
  agentId: number;
  agentSleepTime?: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (path: string) => void;
}

export default function FileTreeModal({ agentId, agentSleepTime = 3, isOpen, onClose, onSelectFile }: FileTreeModalProps) {
  const [roots, setRoots] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const loadRoots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Try to load C:\ for Windows
      const items = await listDirectory(agentId, 'C:\\', agentSleepTime);
      // Validate that we got actual items back
      if (items && Array.isArray(items)) {
        setRoots([{
          name: 'C:\\',
          is_directory: true,
          size: 0,
          path: 'C:\\'
        }]);
        return;
      }
      throw new Error('Invalid response from directory listing');
    } catch (_err) {
      // If C:\ fails, try root / for Unix-like systems
      try {
        const items = await listDirectory(agentId, '/', agentSleepTime);
        // Validate that we got actual items back
        if (items && Array.isArray(items)) {
          setRoots([{
            name: '/',
            is_directory: true,
            size: 0,
            path: '/'
          }]);
          return;
        }
        throw new Error('Invalid response from directory listing');
      } catch (_err2) {
        setError('Failed to load file system. Make sure the agent is online.');
        console.error('Error loading roots:', _err2);
      }
    } finally {
      setIsLoading(false);
    }
  }, [agentId, agentSleepTime]);

  useEffect(() => {
    if (isOpen) {
      loadRoots();
    }
  }, [isOpen, loadRoots]);

  const handleSelectFile = (path: string) => {
    setSelectedPath(path);
  };

  const handleClose = () => {
    // Reset modal state when closing
    setSelectedPath(null);
    setRoots([]);
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onSelectFile(selectedPath);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Browse Agent Files</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[400px]">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading file system...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-400 mb-2">{error}</p>
                <button
                  onClick={loadRoots}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && roots.length > 0 && (
            <div>
              {roots.map((root, index) => (
                <TreeNode
                  key={`${root.path}-${index}`}
                  item={root}
                  agentId={agentId}
                  agentSleepTime={agentSleepTime}
                  onSelectFile={handleSelectFile}
                  level={0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-4">
            {selectedPath ? (
              <div className="text-sm text-gray-400 truncate">
                Selected: <span className="text-white">{selectedPath}</span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Click on a file to select it
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPath}
              className={`px-4 py-2 rounded transition-colors ${
                selectedPath
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
