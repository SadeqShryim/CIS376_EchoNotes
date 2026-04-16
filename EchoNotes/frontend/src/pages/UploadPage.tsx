import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { uploadAudio, type AudioFile } from '../lib/audioStorage';
import { useAudioFiles } from '../lib/audioFilesContext';

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
]);
const ALLOWED_EXT = ['.mp3', '.wav', '.m4a', '.webm', '.ogg'];

function isAudioFile(file: File): boolean {
  if (file.type && ALLOWED_MIME.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const { refetch } = useAudioFiles();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState<AudioFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectFile = (f: File) => {
    if (!isAudioFile(f)) {
      setError('Unsupported file type. Use .mp3, .wav, .m4a, .webm, or .ogg.');
      setFile(null);
      return;
    }
    setError('');
    setFile(f);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!uploading) setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (uploading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await uploadAudio(file);
      setUploaded(result);
      await refetch();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setUploaded(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  if (uploaded) {
    return (
      <div className="upload-page">
        <div className="upload-card">
          <div className="upload-success">
            <div className="upload-success-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1>Upload complete</h1>
            <p className="subtitle">
              {uploaded.filename} · {formatSize(uploaded.file_size ?? 0)}
            </p>
            <div className="upload-success-actions">
              <button className="btn-primary" onClick={() => navigate('/recordings')}>
                Go to Recordings
              </button>
              <button className="btn-ghost" onClick={resetForm}>
                Upload another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <div className="upload-card">
        <div className="upload-header">
          <h1>Upload recording</h1>
          <p className="subtitle">Drag an audio file here or click to browse.</p>
        </div>

        <div
          className={`upload-dropzone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openPicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          aria-label="Audio file drop zone"
        >
          <div className="upload-dropzone-icon">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="upload-dropzone-title">
            {file ? file.name : 'Drop your audio file here'}
          </p>
          <p className="upload-dropzone-sub">
            {file ? formatSize(file.size) : '.mp3 · .wav · .m4a · .webm · .ogg'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
            onChange={handleFileInput}
            disabled={uploading}
            hidden
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        {file && !uploading && (
          <div className="upload-actions">
            <button className="btn-ghost" onClick={resetForm}>
              Clear
            </button>
            <button className="btn-primary" onClick={handleUpload}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              Upload
            </button>
          </div>
        )}

        {uploading && (
          <div className="upload-progress">
            <p className="upload-progress-label">
              <span className="loader-sm" /> Uploading {file?.name}...
            </p>
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" />
            </div>
          </div>
        )}

        <p className="upload-hint">
          Or upload directly from <Link to="/recordings">Recordings</Link>.
        </p>
      </div>
    </div>
  );
}
