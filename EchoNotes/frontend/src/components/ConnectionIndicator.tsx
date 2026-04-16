import { useAudioFiles } from '../lib/audioFilesContext';

const LABELS = {
  connecting: 'Connecting',
  connected: 'Live',
  error: 'Offline',
  disabled: 'Static',
} as const;

export default function ConnectionIndicator() {
  const { connectionState } = useAudioFiles();
  return (
    <span className={`connection-indicator connection-${connectionState}`}>
      <span className="connection-dot" aria-hidden="true" />
      {LABELS[connectionState]}
    </span>
  );
}
