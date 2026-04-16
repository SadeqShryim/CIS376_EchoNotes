import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudioFiles } from '../lib/audioFilesContext';
import RecordingCard from '../components/RecordingCard';
import ConnectionIndicator from '../components/ConnectionIndicator';

type StatusFilter = 'all' | 'uploaded' | 'transcribing' | 'transcribed' | 'completed' | 'failed';
type SortBy = 'newest' | 'oldest' | 'name';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'transcribing', label: 'Transcribing' },
  { value: 'transcribed', label: 'Transcribed' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export default function RecordingsPage() {
  const { files, loading, error: providerError } = useAudioFiles();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const error = providerError || '';
  const isFiltered =
    statusFilter !== 'all' || sortBy !== 'newest' || searchQuery.trim() !== '';

  const clearFilters = () => {
    setStatusFilter('all');
    setSortBy('newest');
    setSearchQuery('');
  };

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = files.filter((f) => {
      if (statusFilter !== 'all' && f.status?.toLowerCase() !== statusFilter) return false;
      if (q && !f.filename.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.filename.localeCompare(b.filename);
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [files, statusFilter, sortBy, searchQuery]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title-row">
            <h1>Your Recordings</h1>
            <ConnectionIndicator />
          </div>
          <p className="subtitle">
            Showing {filteredFiles.length} of {files.length} file
            {files.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link to="/upload" className="btn-primary">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Upload audio
        </Link>
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
            placeholder="Search recordings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search recordings"
          />
        </div>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort order"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
        {isFiltered && (
          <button className="btn-ghost filter-clear" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading && files.length === 0 ? (
        <div className="loading-screen">
          <div className="loader" />
        </div>
      ) : files.length === 0 ? (
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
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p>No recordings yet. Upload your first meeting audio.</p>
          <Link to="/upload" className="btn-primary">
            Upload audio
          </Link>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state">
          <p>No recordings match your filters.</p>
          <button className="btn-ghost" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="audio-list">
          {filteredFiles.map((file) => (
            <RecordingCard key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}
