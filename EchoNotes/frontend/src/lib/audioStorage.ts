import { apiFetch, API_BASE } from './apiClient';
import { getToken } from './authClient';

export interface AudioFile {
  id: string;
  filename: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  transcript: string | null;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function uploadAudio(file: File): Promise<AudioFile> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch('/audio/upload', { method: 'POST', body: form });
  return (await res.json()) as AudioFile;
}

export async function listAudioFiles(): Promise<AudioFile[]> {
  const res = await apiFetch('/audio');
  return (await res.json()) as AudioFile[];
}

export async function getAudioFile(id: string): Promise<AudioFile> {
  const files = await listAudioFiles();
  const file = files.find((f) => f.id === id);
  if (!file) throw new Error('Audio file not found');
  return file;
}

export function getAudioUrl(filePath: string): string {
  const token = getToken() || '';
  return `${API_BASE}/media/${encodeURIComponent(filePath)}?token=${encodeURIComponent(token)}`;
}

export async function deleteAudio(id: string): Promise<void> {
  await apiFetch(`/audio/${id}`, { method: 'DELETE' });
}

export async function transcribeAudio(audioFileId: string): Promise<string> {
  const res = await apiFetch(`/jobs/transcribe/${audioFileId}`, { method: 'POST' });
  const data = await res.json();
  return data.job_id;
}

export async function getJobStatus(jobId: string) {
  const res = await apiFetch(`/jobs/${jobId}/status`);
  return res.json();
}

export async function summarizeAudio(audioFileId: string): Promise<string> {
  const res = await apiFetch(`/audio/${audioFileId}/summarize`, { method: 'POST' });
  const data = await res.json();
  return data.summary;
}

export async function getSummary(audioFileId: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/audio/${audioFileId}/summary`);
    const data = await res.json();
    return data.summary;
  } catch {
    return null;
  }
}
