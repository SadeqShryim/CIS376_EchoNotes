import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getAudioFile, getAudioUrl, transcribeAudio, getJobStatus,
  summarizeAudio, type AudioFile,
} from '../lib/audioStorage';
import TranscriptView from '../components/TranscriptView';
import SummaryView from '../components/SummaryView';

export default function AudioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [file, setFile] = useState<AudioFile | null>(null);
  const [audioSrc, setAudioSrc] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchFile = async () => {
    if (!id) return;
    try {
      const f = await getAudioFile(id);
      setFile(f);

      // Get signed URL for audio playback
      const res = await fetch(getAudioUrl(f.file_path));
      if (res.ok) {
        const data = await res.json();
        setAudioSrc(data.url);
      }
    } catch {
      setError('File not found');
    }
  };

  useEffect(() => {
    fetchFile();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleTranscribe = async () => {
    if (!id) return;
    setTranscribing(true);
    setError('');
    try {
      const jobId = await transcribeAudio(id);
      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          if (status.status === 'succeeded' || status.status === 'failed') {
            clearInterval(pollRef.current);
            setTranscribing(false);
            if (status.status === 'failed') {
              setError('Transcription failed: ' + (status.error_message || 'Unknown error'));
            }
            await fetchFile();
          }
        } catch {
          clearInterval(pollRef.current);
          setTranscribing(false);
        }
      }, 3000);
    } catch (err) {
      setTranscribing(false);
      setError(String(err));
    }
  };

  const handleSummarize = async () => {
    if (!id) return;
    setSummarizing(true);
    setError('');
    try {
      await summarizeAudio(id);
      await fetchFile();
    } catch (err) {
      setError(String(err));
    } finally {
      setSummarizing(false);
    }
  };

  if (error === 'File not found') {
    return (
      <div className="detail-page">
        <p>File not found. <button className="btn-ghost" onClick={() => navigate('/recordings')}>Go back</button></p>
      </div>
    );
  }

  if (!file) {
    return <div className="loading-screen"><div className="loader" /></div>;
  }

  return (
    <div className="detail-page">
      <button className="btn-ghost back-btn" onClick={() => navigate('/recordings')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="detail-header">
        <h1>{file.filename}</h1>
        <span className={`badge badge-${file.status === 'transcribed' || file.status === 'completed' ? 'success' : 'default'}`}>
          {file.status}
        </span>
      </div>

      {audioSrc && (
        <div className="audio-player-wrap">
          <audio controls src={audioSrc} className="audio-player" />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="detail-actions">
        {!file.transcript && (
          <button
            className="btn-primary"
            onClick={handleTranscribe}
            disabled={transcribing}
          >
            {transcribing ? (
              <><span className="loader-sm" /> Transcribing...</>
            ) : (
              'Transcribe'
            )}
          </button>
        )}
        {file.transcript && !file.summary && (
          <button
            className="btn-primary"
            onClick={handleSummarize}
            disabled={summarizing}
          >
            {summarizing ? (
              <><span className="loader-sm" /> Summarizing...</>
            ) : (
              'Summarize'
            )}
          </button>
        )}
      </div>

      {file.transcript && (
        <section className="detail-section">
          <h2>Transcript</h2>
          <TranscriptView transcript={file.transcript} />
        </section>
      )}

      {file.summary && (
        <section className="detail-section">
          <h2>Summary</h2>
          <SummaryView summary={file.summary} />
        </section>
      )}
    </div>
  );
}
