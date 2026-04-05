import { useRef, useState } from 'react'
import { uploadAudioFile, type UploadSuccessResponse } from '../lib/uploadApi'

const ALLOWED_EXTENSIONS = ['wav', 'mp3', 'm4a', 'flac']
const ALLOWED_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/flac',
  'audio/x-flac',
]
const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export default function AudioUploadTest() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<UploadSuccessResponse | null>(null)
  const [uploading, setUploading] = useState(false)

  function getFileExtension(filename: string) {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  function validateFile(file: File) {
    const extension = getFileExtension(file.name)
    const mimeType = file.type

    if (!file) {
      return 'Missing file. Please select an audio file.'
    }

    if (file.size === 0) {
      return 'The selected file is empty.'
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`
    }

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return 'Unsupported type. Allowed file extensions are WAV, MP3, M4A, and FLAC.'
    }

    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return 'Unsupported type. Please select a valid audio file.'
    }

    return null
  }

  function clearSelection() {
    setSelectedFile(null)
    setError(null)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function resetAll() {
    setSelectedFile(null)
    setError(null)
    setSuccess(null)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null

    setError(null)
    setSuccess(null)

    if (!file) {
      setSelectedFile(null)
      return
    }

    const validationError = validateFile(file)

    if (validationError) {
      setSelectedFile(null)
      setError(validationError)
      return
    }

    setSelectedFile(file)
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError('Missing file. Please select a valid audio file before uploading.')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await uploadAudioFile(selectedFile)
      setSuccess(result)
      setSelectedFile(null)

      if (inputRef.current) {
        inputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const uploadButtonLabel = uploading
    ? 'Uploading...'
    : selectedFile
    ? 'Upload File'
    : 'Select a File First'

  return (
    <section style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>Upload Audio File</h2>
          <p style={styles.subtitle}>
            Supported formats: WAV, MP3, M4A, FLAC. Maximum size: {MAX_FILE_SIZE_MB} MB.
          </p>
          <p style={styles.helperText}>
            This upload form is built for UC-1 and will connect to the backend upload endpoint.
          </p>
        </div>

        <label style={styles.uploadArea}>
          <input
            ref={inputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.flac,audio/*"
            onChange={handleFileChange}
            style={styles.hiddenInput}
            disabled={uploading}
          />
          <span style={styles.uploadAreaText}>
            {selectedFile ? 'Choose a different audio file' : 'Click here to select an audio file'}
          </span>
          <span style={styles.uploadAreaSubtext}>
            Audio only, private upload flow, validated before submission.
          </span>
        </label>

        {!selectedFile && !uploading && !success && (
          <div style={styles.infoBox}>
            No file selected yet. Choose an audio file to view details before uploading.
          </div>
        )}

        {selectedFile && (
          <div style={styles.fileDetails}>
            <div style={styles.fileDetailsHeader}>
              <h3 style={styles.sectionTitle}>Selected File</h3>
              <button type="button" onClick={clearSelection} style={styles.secondaryButton}>
                Clear File
              </button>
            </div>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Name:</span>
              <span style={styles.detailValue}>{selectedFile.name}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Type:</span>
              <span style={styles.detailValue}>{selectedFile.type || 'Unknown'}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Size:</span>
              <span style={styles.detailValue}>{formatFileSize(selectedFile.size)}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Status:</span>
              <span style={styles.detailValue}>Ready to upload</span>
            </div>
          </div>
        )}

        <div style={styles.buttonRow}>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            style={{
              ...styles.uploadButton,
              opacity: !selectedFile || uploading ? 0.6 : 1,
              cursor: !selectedFile || uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploadButtonLabel}
          </button>

          <button
            type="button"
            onClick={resetAll}
            disabled={uploading && !selectedFile && !success && !error}
            style={styles.secondaryButton}
          >
            Reset
          </button>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <h3 style={styles.messageTitle}>Upload Error</h3>
            <p style={styles.messageText}>{error}</p>
          </div>
        )}

        {success && (
          <div style={styles.successBox}>
            <h3 style={styles.successTitle}>Upload Successful</h3>
            <p style={styles.messageText}>
              Your audio file passed validation and the frontend received a successful upload response.
            </p>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>File ID:</span>
              <span style={styles.detailValue}>{success.audio_file_id}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Filename:</span>
              <span style={styles.detailValue}>{success.filename}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Size:</span>
              <span style={styles.detailValue}>{formatFileSize(success.size)}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>MIME:</span>
              <span style={styles.detailValue}>{success.mime}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Created At:</span>
              <span style={styles.detailValue}>
                {new Date(success.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginTop: '24px',
  },
  card: {
    background: '#111827',
    border: '1px solid #334155',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
  },
  header: {
    marginBottom: '24px',
    textAlign: 'left',
  },
  title: {
    margin: 0,
    fontSize: '1.8rem',
    color: '#f8fafc',
  },
  subtitle: {
    marginTop: '10px',
    marginBottom: '8px',
    color: '#cbd5e1',
  },
  helperText: {
    margin: 0,
    color: '#94a3b8',
    fontSize: '0.95rem',
  },
  uploadArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    border: '2px dashed #475569',
    borderRadius: '16px',
    padding: '28px',
    textAlign: 'center',
    background: '#0f172a',
    cursor: 'pointer',
    marginBottom: '20px',
  },
  uploadAreaText: {
    color: '#e2e8f0',
    fontSize: '1rem',
    fontWeight: 600,
  },
  uploadAreaSubtext: {
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  hiddenInput: {
    display: 'none',
  },
  infoBox: {
    background: '#172554',
    border: '1px solid #1d4ed8',
    color: '#bfdbfe',
    borderRadius: '12px',
    padding: '14px',
    textAlign: 'left',
    marginBottom: '20px',
  },
  fileDetails: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '18px',
    marginBottom: '20px',
    textAlign: 'left',
  },
  fileDetailsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '14px',
  },
  sectionTitle: {
    margin: 0,
    color: '#f8fafc',
    fontSize: '1.1rem',
  },
  detailRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontWeight: 700,
    color: '#a78bfa',
    minWidth: '90px',
  },
  detailValue: {
    color: '#e2e8f0',
    wordBreak: 'break-word',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  uploadButton: {
    background: '#8b5cf6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 22px',
    fontSize: '1rem',
    fontWeight: 700,
  },
  secondaryButton: {
    background: '#1f2937',
    color: '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: '12px',
    padding: '10px 18px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBox: {
    background: '#450a0a',
    border: '1px solid #991b1b',
    color: '#fca5a5',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'left',
  },
  successBox: {
    background: '#052e16',
    border: '1px solid #166534',
    color: '#86efac',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'left',
  },
  successTitle: {
    marginTop: 0,
    marginBottom: '10px',
    color: '#bbf7d0',
  },
  messageTitle: {
    marginTop: 0,
    marginBottom: '10px',
    color: '#fecaca',
  },
  messageText: {
    marginTop: 0,
    marginBottom: '14px',
    color: 'inherit',
  },
}