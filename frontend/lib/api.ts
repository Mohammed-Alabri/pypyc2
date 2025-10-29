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
export function getAgentStatus(lastSeen: string): 'online' | 'offline' {
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffSeconds = (now.getTime() - lastSeenDate.getTime()) / 1000;

  // Consider online if last seen within 15 seconds (agent polls every 3s, terminal refreshes every 5s)
  return diffSeconds < 20 ? 'online' : 'offline';
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
