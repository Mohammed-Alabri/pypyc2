export interface Agent {
  id: number;
  ipaddr: string;
  hostname: string;
  user: string;
  last_seen: string;
  joined_at: string;
  total_commands: number;
  uploaded_files_count: number;
  downloaded_files_count: number;
}

export interface AgentDetailed extends Agent {
  commands: Command[];
  uploaded_files: UploadedFile[];
  downloaded_files: DownloadedFile[];
}

export interface CommandData {
  command?: string;         // For exec commands
  source_path?: string;     // For upload commands
  filename?: string;        // For upload/download commands
  save_as?: string;         // For download commands
  url?: string;             // For download commands
  path?: string;            // For list_directory commands
}

export interface Command {
  command_id: number;
  type: 'exec' | 'upload' | 'download' | 'list_directory' | 'terminate';
  data?: CommandData;
  status: 'pending' | 'retrieved' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  result?: string;
  error?: string;
}

export interface CommandResult {
  command_id: number;
  type: string;
  data?: CommandData;
  status: string;
  result?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
}

export interface UploadedFile {
  filename: string;
  filepath: string;
  size: number;
  uploaded_at: string;
}

export interface DownloadedFile {
  filename: string;
  downloaded_at: string;
}

export interface FileInfo {
  filename: string;
  size: number;
}
