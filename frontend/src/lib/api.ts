import { Agent, AgentDetailed, CommandResult, FileInfo } from '@/types/agent';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Get auth token from localStorage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

// Helper function for API calls
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - redirect to login
  if (response.status === 401) {
    // Clear auth data
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Agent management
export async function getAgents(): Promise<Agent[]> {
  return apiCall<Agent[]>('/agents');
}

export async function getAgent(agentId: number): Promise<AgentDetailed> {
  return apiCall<AgentDetailed>(`/agent/${agentId}`);
}

export async function deleteAgent(agentId: number): Promise<{ status: string; message: string; terminated: boolean }> {
  return apiCall<{ status: string; message: string; terminated: boolean }>(`/agent/${agentId}`, {
    method: 'DELETE',
  });
}

export async function terminateAgent(agentId: number): Promise<{ command_id: number; type: string; status: string; message: string }> {
  return apiCall<{ command_id: number; type: string; status: string; message: string }>(`/command/${agentId}/terminate`, {
    method: 'POST',
  });
}

// Command management
export async function executeCommand(agentId: number, command: string) {
  return apiCall(`/command/${agentId}/exec?command=${encodeURIComponent(command)}`, {
    method: 'POST',
  });
}

export async function createUploadCommand(
  agentId: number,
  sourcePath: string,
  filename?: string
) {
  const params = new URLSearchParams({ source_path: sourcePath });
  if (filename) params.append('filename', filename);

  return apiCall(`/command/${agentId}/upload?${params.toString()}`, {
    method: 'POST',
  });
}

export async function createDownloadCommand(
  agentId: number,
  filename: string,
  saveAs?: string
) {
  const params = new URLSearchParams({ filename });
  if (saveAs) params.append('save_as', saveAs);

  return apiCall(`/command/${agentId}/download?${params.toString()}`, {
    method: 'POST',
  });
}

export async function setSleepTime(
  agentId: number,
  sleepTime: number
): Promise<{ command_id: number; type: string; status: string; message: string }> {
  const params = new URLSearchParams({ sleep_time: sleepTime.toString() });
  return apiCall<{ command_id: number; type: string; status: string; message: string }>(
    `/command/${agentId}/set_sleep_time?${params.toString()}`,
    {
      method: 'POST',
    }
  );
}

export async function listDirectory(
  agentId: number,
  path: string,
  agentSleepTime: number = 3
): Promise<{ name: string; is_directory: boolean; size: number; path: string }[]> {
  // Create list_directory command
  const params = new URLSearchParams({ path });
  const response = await apiCall<{ command_id: number }>(`/command/${agentId}/list_directory?${params.toString()}`, {
    method: 'POST',
  });

  // Poll for result
  const commandId = response.command_id;
  let attempts = 0;
  // Calculate timeout based on agent sleep_time: (sleep_time * 3 + 10) / 0.5
  const maxAttempts = Math.max(20, Math.ceil((agentSleepTime * 3 + 10) / 0.5));

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;

    try {
      const result = await getCommandResult(agentId, commandId);

      if (result.status === 'completed' && result.result) {
        // Parse the JSON result
        const parsed = JSON.parse(result.result);
        if (parsed.status === 'success') {
          return parsed.items;
        } else {
          throw new Error(parsed.error || 'Failed to list directory');
        }
      } else if (result.status === 'failed') {
        throw new Error(result.error || 'Command failed');
      }
      // If status is still 'queued', continue polling
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Only continue polling if command not found yet (404) or still queued
      const isCommandNotReady = errorMessage.includes('404') ||
                                 errorMessage.includes('not found') ||
                                 errorMessage.includes('queued');

      if (!isCommandNotReady || attempts >= maxAttempts) {
        // Real error or timeout - stop polling
        throw error;
      }
      // Command not ready yet, continue polling
    }
  }

  throw new Error('Timeout waiting for directory listing (agent may be offline)');
}

export async function getCommandResult(
  agentId: number,
  commandId: number
): Promise<CommandResult> {
  return apiCall<CommandResult>(`/command/${agentId}/${commandId}`);
}

// File management
export async function listAgentFiles(agentId: number): Promise<{ files: FileInfo[] }> {
  return apiCall<{ files: FileInfo[] }>(`/files/${agentId}`);
}

export async function uploadFileForAgent(agentId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/upload_for_agent/${agentId}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function downloadFile(agentDir: string, filename: string): Promise<Blob> {
  // Extract agent_id from agentDir (format: "agent_123456")
  const agentId = agentDir.replace('agent_', '');

  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/dashboard/files/${agentId}/${filename}`, {
    headers,
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized. Please login again.');
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.blob();
}

// Utility functions
export function getAgentStatus(lastSeen: string, sleepTime: number = 3): 'online' | 'offline' {
  // Ensure we parse the timestamp as UTC
  // Backend now sends UTC timestamps with timezone info (e.g., "2025-11-05T09:03:35.636072+00:00")
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffSeconds = (now.getTime() - lastSeenDate.getTime()) / 1000;

  // Agent is online if last seen within 2x sleep_time + 5s buffer
  const threshold = sleepTime * 2 + 5;
  return diffSeconds < threshold ? 'online' : 'offline';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Payload token management
export async function getPayloadToken(): Promise<{ token: string; expires_in: number; lifetime: number }> {
  return apiCall<{ token: string; expires_in: number; lifetime: number }>('/api/payload-token');
}

// File Manager functions
export async function readFile(
  agentId: number,
  path: string,
  timeout: number = 30
): Promise<{ content: string; encoding: string; size: number; is_binary: boolean }> {
  // New workflow: Server creates upload command, waits for upload, detects encoding, returns content
  const params = new URLSearchParams({ path, timeout: timeout.toString() });
  const response = await apiCall<{
    content: string;
    encoding: string;
    size: number;
    is_binary: boolean;
  }>(`/command/${agentId}/edit_file/read?${params.toString()}`, {
    method: 'POST',
  });

  return response;
}

export async function writeFile(
  agentId: number,
  path: string,
  content: string,
  encoding: string = 'utf-8',
  timeout: number = 30
): Promise<string> {
  // New workflow: Server saves content, creates download command, agent writes file
  const response = await apiCall<{
    status: string;
    message: string;
    size: number;
  }>(`/command/${agentId}/edit_file/write`, {
    method: 'POST',
    body: JSON.stringify({ path, content, encoding, timeout }),
  });

  return response.message;
}

export async function deleteFile(
  agentId: number,
  path: string,
  recursive: boolean = false,
  agentSleepTime: number = 3
): Promise<string> {
  // Create delete command
  const params = new URLSearchParams({
    path,
    recursive: recursive.toString(),
  });
  const response = await apiCall<{ command_id: number }>(`/command/${agentId}/delete?${params.toString()}`, {
    method: 'POST',
  });

  // Poll for result
  const commandId = response.command_id;
  let attempts = 0;
  const maxAttempts = Math.max(20, Math.ceil((agentSleepTime * 3 + 10) / 0.5));

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;

    try {
      const result = await getCommandResult(agentId, commandId);

      if (result.status === 'completed' && result.result) {
        return result.result; // Success message like "File deleted: path"
      } else if (result.status === 'failed') {
        throw new Error(result.error || 'Failed to delete file');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCommandNotReady = errorMessage.includes('404') ||
                                 errorMessage.includes('not found') ||
                                 errorMessage.includes('queued');

      if (!isCommandNotReady || attempts >= maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Timeout waiting for file delete (agent may be offline)');
}

// Request file from agent to server (upload from agent)
export async function requestFileFromAgent(
  agentId: number,
  sourcePath: string,
  filename?: string,
  agentSleepTime: number = 3
): Promise<string> {
  const params = new URLSearchParams({ source_path: sourcePath });
  if (filename) {
    params.append('filename', filename);
  }

  const response = await apiCall<{ command_id: number }>(`/command/${agentId}/upload?${params.toString()}`, {
    method: 'POST',
  });

  // Poll for result
  const commandId = response.command_id;
  let attempts = 0;
  const maxAttempts = Math.max(40, Math.ceil((agentSleepTime * 3 + 20) / 0.5));

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;

    try {
      const result = await getCommandResult(agentId, commandId);

      if (result.status === 'completed' && result.result) {
        return result.result; // Success message
      } else if (result.status === 'failed') {
        throw new Error(result.error || 'Failed to upload file from agent');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCommandNotReady = errorMessage.includes('404') ||
                                 errorMessage.includes('not found') ||
                                 errorMessage.includes('queued');

      if (!isCommandNotReady || attempts >= maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Timeout waiting for file upload (agent may be offline)');
}

// Download file from server to agent (push file to agent)
export async function downloadFileToAgent(
  agentId: number,
  filename: string,
  saveAs: string,
  agentSleepTime: number = 3
): Promise<string> {
  const params = new URLSearchParams({ filename });
  if (saveAs) {
    params.append('save_as', saveAs);
  }

  const response = await apiCall<{ command_id: number }>(`/command/${agentId}/download?${params.toString()}`, {
    method: 'POST',
  });

  // Poll for result
  const commandId = response.command_id;
  let attempts = 0;
  const maxAttempts = Math.max(40, Math.ceil((agentSleepTime * 3 + 20) / 0.5));

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;

    try {
      const result = await getCommandResult(agentId, commandId);

      if (result.status === 'completed' && result.result) {
        return result.result; // Success message
      } else if (result.status === 'failed') {
        throw new Error(result.error || 'Failed to download file to agent');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCommandNotReady = errorMessage.includes('404') ||
                                 errorMessage.includes('not found') ||
                                 errorMessage.includes('queued');

      if (!isCommandNotReady || attempts >= maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Timeout waiting for file download to agent (agent may be offline)');
}
