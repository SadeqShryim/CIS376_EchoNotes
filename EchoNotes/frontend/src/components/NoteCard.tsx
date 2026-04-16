import { useState } from 'react';
import { Link } from 'react-router-dom';
import { summarizeAudio, type AudioFile } from '../lib/audioStorage';
import { useAudioFiles } from '../lib/audioFilesContext';
import TranscriptView from './TranscriptView';
import SummaryView from './SummaryView';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summaryPreview(summary: string | null): string {
  if (!summary) return 'Awaiting summary.';
  const cleaned = summary
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-•]\s*/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}…` : cleaned;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

type NoteCardProps = {
  file: AudioFile;
  expanded: boolean;
  onToggle: () => void;
};

export default function NoteCard({ file, expanded, onToggle }: NoteCardProps) {
  const { refetch } = useAudioFiles();
  const [summarizing, setSummarizing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isCompleted =
    file.status?.toLowerCase() === 'completed' || Boolean(file.summary);
  const statusLabel = isCompleted ? 'Completed' : 'Transcribed';

  const copy = async (key: string, text: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setError('');
    try {
      await summarizeAudio(file.id);
      await refetch();
    } catch (err) {
      setError(String(err));
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className={`note-card ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="note-card-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span
          className={`note-status-dot ${isCompleted ? 'note-dot-completed' : 'note-dot-transcribed'}`}
          aria-hidden="true"
        />
        <div className="note-card-body">
          <div className="note-card-header-row">
            <span className="note-card-title">{file.filename}</span>
            <span className="note-card-date">{formatDate(file.created_at)}</span>
          </div>
          <p className="note-card-preview">{summaryPreview(file.summary)}</p>
          <div className="note-card-meta">
            <span
              className={`note-badge note-badge-${isCompleted ? 'success' : 'default'}`}
            >
              {statusLabel}
            </span>
            <span>{formatSize(file.file_size)}</span>
          </div>
        </div>
        <div
          className={`note-card-chevron ${expanded ? 'rotated' : ''}`}
          aria-hidden="true"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="note-card-expanded-body">
          <div className="note-columns">
            <section className="note-column">
              <div className="note-column-header">
                <h4>Transcript</h4>
                <button
                  type="button"
                  className="note-column-btn"
                  onClick={() => copy('transcript', file.transcript)}
                  disabled={!file.transcript}
                >
                  {copiedKey === 'transcript' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="note-transcript-scroll">
                {file.transcript ? (
                  <TranscriptView transcript={file.transcript} />
                ) : (
                  <p className="note-column-empty">Transcript not available.</p>
                )}
              </div>
            </section>

            <section className="note-column">
              <div className="note-column-header">
                <h4>Summary</h4>
                <button
                  type="button"
                  className="note-column-btn"
                  onClick={() => copy('summary', file.summary)}
                  disabled={!file.summary}
                >
                  {copiedKey === 'summary' ? 'Copied' : 'Copy'}
                </button>
              </div>
              {file.summary ? (
                <SummaryView summary={file.summary} />
              ) : (
                <div className="note-summary-empty">
                  <p>No summary yet.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSummarize}
                    disabled={summarizing}
                  >
                    {summarizing ? (
                      <>
                        <span className="loader-sm" /> Generating
                      </>
                    ) : (
                      'Generate summary'
                    )}
                  </button>
                </div>
              )}
            </section>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="note-card-actions">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() =>
                file.transcript &&
                downloadText(`${baseName(file.filename)}-transcript.txt`, file.transcript)
              }
              disabled={!file.transcript}
            >
              <svg
                width="14"
                height="14"
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
              Transcript .txt
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() =>
                file.summary &&
                downloadText(`${baseName(file.filename)}-summary.txt`, file.summary)
              }
              disabled={!file.summary}
            >
              <svg
                width="14"
                height="14"
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
              Summary .txt
            </button>
            <Link to={`/audio/${file.id}`} className="btn-ghost btn-sm">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open full recording
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
