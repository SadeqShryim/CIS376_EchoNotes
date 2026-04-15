import { useEffect, useRef, useState } from 'react';
import { listAudioFiles, uploadAudio, deleteAudio, type AudioFile } from '../lib/audioStorage';
import AudioCard from '../components/AudioCard';

export default function DashboardPage() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const data = await listAudioFiles();
      setFiles(data);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadAudio(file);
      await fetchFiles();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAudio(id);
      await fetchFiles();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Your Recordings</h1>
          <p className="subtitle">{files.length} file{files.length !== 1 ? 's' : ''} uploaded</p>
        </div>
        <label className={`btn-primary upload-btn ${uploading ? 'uploading' : ''}`}>
          {uploading ? (
            <><span className="loader-sm" /> Uploading...</>
          ) : (
            <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg> Upload audio</>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            disabled={uploading}
            hidden
          />
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      {files.length === 0 && !uploading ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          <p>No recordings yet. Upload your first meeting audio.</p>
        </div>
      ) : (
        <div className="audio-list">
          {files.map((file) => (
            <div key={file.id} className="audio-card-wrapper">
              <AudioCard file={file} />
              <button
                className="delete-btn"
                onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                title="Delete"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
