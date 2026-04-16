import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteAudio,
  getAudioUrl,
  getJobStatus,
  transcribeAudio,
  type AudioFile,
} from '../lib/audioStorage';
import { useAudioFiles } from '../lib/audioFilesContext';

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusBadgeClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'transcribing' || lower === 'summarizing' || lower === 'processing') return 'badge-pending';
  if (lower === 'transcribed' || lower === 'completed') return 'badge-success';
  if (lower === 'failed' || lower === 'error') return 'badge-error';
  return 'badge-default';
}

export default function RecordingCard({ file }: { file: AudioFile }) {
  const { currentlyPlayingId, setCurrentlyPlayingId, refetch } = useAudioFiles();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playOnReadyRef = useRef(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [actionError, setActionError] = useState('');

  const isCurrent = currentlyPlayingId === file.id;
  const displayStatus = transcribing ? 'transcribing' : file.status;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const statusLower = file.status?.toLowerCase() ?? '';
  const canTranscribe = statusLower === 'uploaded' || statusLower === 'failed';

  useEffect(() => {
    if (!isCurrent && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isCurrent]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  const loadAudioUrl = async (): Promise<string> => {
    if (audioSrc) return audioSrc;
    setLoadingAudio(true);
    try {
      const res = await fetch(getAudioUrl(file.file_path));
      if (!res.ok) throw new Error('Failed to load audio');
      const data = await res.json();
      setAudioSrc(data.url);
      return data.url;
    } finally {
      setLoadingAudio(false);
    }
  };

  const togglePlay = async () => {
    setActionError('');
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) {
        audio.pause();
        return;
      }
      setCurrentlyPlayingId(file.id);
      if (!audioSrc) {
        playOnReadyRef.current = true;
        await loadAudioUrl();
        // src will be set via React re-render; onCanPlay triggers play()
        return;
      }
      await audio.play();
    } catch (err) {
      playOnReadyRef.current = false;
      setActionError(String(err));
    }
  };

  const handleCanPlay = () => {
    if (playOnReadyRef.current && audioRef.current) {
      playOnReadyRef.current = false;
      audioRef.current.play().catch((err) => setActionError(String(err)));
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  const handleTranscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionError('');
    setTranscribing(true);
    try {
      const jobId = await transcribeAudio(file.id);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          if (status.status === 'succeeded' || status.status === 'failed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setTranscribing(false);
            if (status.status === 'failed') {
              setActionError(status.error_message || 'Transcription failed');
            }
            await refetch();
          }
        } catch (err) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setTranscribing(false);
          setActionError(String(err));
        }
      }, 3000);
    } catch (err) {
      setTranscribing(false);
      setActionError(String(err));
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${file.filename}"?`)) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (isCurrent) setCurrentlyPlayingId(null);
      await deleteAudio(file.id);
      await refetch();
    } catch (err) {
      setActionError(String(err));
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionError('');
    try {
      const url = await loadAudioUrl();
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setActionError(String(err));
    }
  };

  return (
    <div className="recording-card">
      <div className="recording-card-row">
        <Link to={`/audio/${file.id}`} className="recording-card-main">
          <div className="audio-card-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
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
          <span className={`badge ${statusBadgeClass(displayStatus)}`}>{displayStatus}</span>
        </Link>
      </div>

      <div className="recording-card-footer">
        <div className="mini-player">
          <button
            type="button"
            className="mini-player-btn"
            onClick={togglePlay}
            disabled={loadingAudio}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {loadingAudio ? (
              <span className="loader-sm" />
            ) : isPlaying ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 4.5v15l14-7.5z" />
              </svg>
            )}
          </button>
          <div
            className="mini-player-progress"
            onClick={handleSeek}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
            tabIndex={0}
          >
            <div
              className="mini-player-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="mini-player-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="recording-card-actions">
          {canTranscribe && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleTranscribe}
              disabled={transcribing}
              title="Transcribe this recording"
            >
              {transcribing ? (
                <>
                  <span className="loader-sm" /> Transcribing
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                  </svg>
                  Transcribe
                </>
              )}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={handleDownload}
            title="Download"
            aria-label={`Download ${file.filename}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={handleDelete}
            title="Delete"
            aria-label={`Delete ${file.filename}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
      </div>

      {actionError && <div className="recording-card-error">{actionError}</div>}

      <audio
        ref={audioRef}
        src={audioSrc ?? undefined}
        preload="metadata"
        onCanPlay={handleCanPlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (isCurrent) setCurrentlyPlayingId(null);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        style={{ display: 'none' }}
      />
    </div>
  );
}
