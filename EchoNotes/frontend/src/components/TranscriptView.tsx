const SPEAKER_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

function getSpeakerColor(speaker: string): string {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
}

export default function TranscriptView({ transcript }: { transcript: string }) {
  const lines = transcript.split('\n').filter(Boolean);

  return (
    <div className="transcript-view">
      {lines.map((line, i) => {
        const match = line.match(/^(Speaker\s+\w+):\s*(.*)/);
        if (match) {
          const [, speaker, text] = match;
          const color = getSpeakerColor(speaker);
          return (
            <div key={i} className="transcript-line">
              <span className="transcript-speaker" style={{ color }}>
                {speaker}
              </span>
              <span className="transcript-text">{text}</span>
            </div>
          );
        }
        return (
          <div key={i} className="transcript-line">
            <span className="transcript-text">{line}</span>
          </div>
        );
      })}
    </div>
  );
}
