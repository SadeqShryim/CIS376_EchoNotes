import { apiFetch } from './apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the audio record returned by backend. */
export interface AudioFile {
  id: string;
  filename: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  /** Status flow: uploaded -> transcribing -> transcribed -> summarizing -> completed */
  status: string;
  created_at: string;
  updated_at: string;
}

/** Fields that can be patched later when metadata endpoint is added. */
export interface AudioFileUpdate {
  transcript?: string;
  summary?: string;
  status?: string;
}

const BACKEND_BASE = 'http://127.0.0.1:8000';

// ---------------------------------------------------------------------------
// Public API (backend-driven)
// ---------------------------------------------------------------------------

export async function uploadAudio(file: File): Promise<AudioFile> {
  const form = new FormData();
  form.append('file', file);

  const res = await apiFetch('/audio/upload', {
    method: 'POST',
    body: form,
  });

  return (await res.json()) as AudioFile;
}

export async function listAudioFiles(): Promise<AudioFile[]> {
  const res = await apiFetch('/audio', { method: 'GET' });
  return (await res.json()) as AudioFile[];
}

export function getAudioUrl(filePath: string): string {
  return `${BACKEND_BASE}/media/${encodeURIComponent(filePath)}`;
}

export async function deleteAudio(id: string, _filePath: string): Promise<void> {
  await apiFetch(`/audio/${id}`, { method: 'DELETE' });
}

export async function updateAudioMetadata(
  _id: string,
  _updates: AudioFileUpdate,
): Promise<AudioFile> {
  throw new Error('updateAudioMetadata is not implemented in backend MVP yet');
}