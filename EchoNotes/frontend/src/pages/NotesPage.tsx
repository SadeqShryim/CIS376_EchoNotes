import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudioFiles } from '../lib/audioFilesContext';
import NoteCard from '../components/NoteCard';
import ConnectionIndicator from '../components/ConnectionIndicator';

export default function NotesPage() {
  const { files, loading } = useAudioFiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const noteFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = files.filter((f) => {
      const status = f.status?.toLowerCase() ?? '';
      const hasContent =
        ['transcribed', 'completed'].includes(status) && Boolean(f.transcript);
      if (!hasContent) return false;
      if (q) {
        const haystack = `${f.filename} ${f.transcript ?? ''} ${f.summary ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [files, searchQuery, sortBy]);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="dashboard notes-page">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title-row">
            <h1>Notes</h1>
            <ConnectionIndicator />
          </div>
          <p className="subtitle">
            {noteFiles.length} transcribed recording{noteFiles.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search transcripts and summaries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search notes"
          />
        </div>
        <select
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
          aria-label="Sort notes"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {loading && files.length === 0 ? (
        <div className="loading-screen">
          <div className="loader" />
        </div>
      ) : noteFiles.length === 0 ? (
        <div className="empty-state">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.4"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          <p>
            {searchQuery
              ? 'No notes match your search.'
              : 'No notes yet. Transcribe a recording to see it here.'}
          </p>
          {!searchQuery && (
            <Link to="/recordings" className="btn-primary">
              Go to Recordings
            </Link>
          )}
        </div>
      ) : (
        <div className="notes-list">
          {noteFiles.map((file) => (
            <NoteCard
              key={file.id}
              file={file}
              expanded={expandedId === file.id}
              onToggle={() => toggle(file.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
