import { useNavigate } from 'react-router-dom';
import type { AudioFile } from '../lib/audioStorage';

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    uploaded: 'badge-default',
    transcribed: 'badge-success',
    completed: 'badge-success',
    failed: 'badge-error',
  };
  return colors[status] || 'badge-default';
}

export default function AudioCard({ file }: { file: AudioFile }) {
  const navigate = useNavigate();

  return (
    <button
      className="audio-card"
      onClick={() => navigate(`/audio/${file.id}`)}
    >
      <div className="audio-card-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <div className="audio-card-body">
        <h3 className="audio-card-title">{file.filename}</h3>
        <div className="audio-card-meta">
          <span>{formatSize(file.file_size)}</span>
          <span className="meta-dot">·</span>
          <span>{formatDate(file.created_at)}</span>
        </div>
      </div>
      <span className={`badge ${statusBadge(file.status)}`}>
        {file.status}
      </span>
    </button>
  );
}
