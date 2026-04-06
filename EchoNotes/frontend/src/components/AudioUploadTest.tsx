/**
 * AudioUploadTest.tsx
 * -------------------
 * Quick test component to verify Supabase audio upload works.
 * Upload a file, see it appear in the list, play it, or delete it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  uploadAudio,
  listAudioFiles,
  getAudioUrl,
  deleteAudio,
} from '../lib/audioStorage';
import type { AudioFile } from '../lib/audioStorage';

export default function AudioUploadTest() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing files on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  async function fetchFiles() {
    try {
      const data = await listAudioFiles();
      setFiles(data);
    } catch (err) {
      setError(`Failed to load files: ${(err as Error).message}`);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const uploaded = await uploadAudio(file);
      setSuccess(`✅ Uploaded "${uploaded.filename}" successfully!`);
      await fetchFiles(); // refresh the list
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(audioFile: AudioFile) {
    setError(null);
    setSuccess(null);
    try {
      await deleteAudio(audioFile.id, audioFile.file_path);
      setSuccess(`🗑️ Deleted "${audioFile.filename}"`);
      await fetchFiles();
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    }
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🎧 Audio Upload Test</h2>
      <p style={styles.subtitle}>Upload an audio file to verify Supabase integration</p>

      {/* Upload area */}
      <label style={styles.uploadLabel}>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={handleUpload}
          disabled={uploading}
          style={styles.fileInput}
        />
        <div style={styles.uploadBox}>
          {uploading ? '⏳ Uploading...' : '📁 Click to select an audio file'}
        </div>
      </label>

      {/* Status messages */}
      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {/* File list */}
      <div style={styles.fileList}>
        <h3 style={styles.listTitle}>
          Files in Supabase ({files.length})
        </h3>
        {files.length === 0 && (
          <p style={styles.empty}>No files yet — upload one above!</p>
        )}
        {files.map((f) => (
          <div key={f.id} style={styles.fileCard}>
            <div style={styles.fileInfo}>
              <strong>{f.filename}</strong>
              <span style={styles.meta}>
                {formatSize(f.file_size)} · {f.status} · {new Date(f.created_at).toLocaleString()}
              </span>
            </div>
            <audio controls src={getAudioUrl(f.file_path)} style={styles.audio} />
            <button onClick={() => handleDelete(f)} style={styles.deleteBtn}>
              🗑️ Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Inline styles for quick test UI ---- */
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 600,
    margin: '2rem auto',
    padding: '1.5rem',
    background: '#1a1a2e',
    borderRadius: 12,
    fontFamily: 'system-ui, sans-serif',
    color: '#e0e0e0',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
  },
  subtitle: {
    margin: '0.25rem 0 1.5rem',
    color: '#888',
    fontSize: '0.9rem',
  },
  uploadLabel: {
    cursor: 'pointer',
    display: 'block',
  },
  fileInput: {
    display: 'none',
  },
  uploadBox: {
    border: '2px dashed #444',
    borderRadius: 8,
    padding: '2rem',
    textAlign: 'center' as const,
    fontSize: '1rem',
    color: '#aaa',
    transition: 'border-color 0.2s',
  },
  error: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: '#2d1b1b',
    border: '1px solid #5c2a2a',
    borderRadius: 8,
    color: '#ff6b6b',
  },
  success: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: '#1b2d1b',
    border: '1px solid #2a5c2a',
    borderRadius: 8,
    color: '#6bff6b',
  },
  fileList: {
    marginTop: '2rem',
  },
  listTitle: {
    fontSize: '1.1rem',
    marginBottom: '0.75rem',
  },
  empty: {
    color: '#666',
    fontStyle: 'italic',
  },
  fileCard: {
    background: '#16213e',
    borderRadius: 8,
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    marginBottom: '0.5rem',
  },
  meta: {
    fontSize: '0.8rem',
    color: '#888',
  },
  audio: {
    width: '100%',
    marginBottom: '0.5rem',
  },
  deleteBtn: {
    background: '#5c2a2a',
    color: '#ff6b6b',
    border: 'none',
    borderRadius: 6,
    padding: '0.4rem 0.8rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
};
