export default function SummaryView({ summary }: { summary: string }) {
  const sections = summary.split('\n\n');

  return (
    <div className="summary-view">
      {sections.map((section, i) => {
        const lines = section.split('\n');
        const heading = lines[0]?.startsWith('#') || lines[0]?.startsWith('**');

        if (heading) {
          const title = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '');
          const body = lines.slice(1);
          return (
            <div key={i} className="summary-section">
              <h4 className="summary-heading">{title}</h4>
              {body.map((line, j) => (
                <p key={j} className="summary-line">
                  {line.replace(/^[-•]\s*/, '').replace(/\*\*/g, '')}
                </p>
              ))}
            </div>
          );
        }

        return (
          <div key={i} className="summary-section">
            {lines.map((line, j) => (
              <p key={j} className="summary-line">
                {line.replace(/^[-•]\s*/, '').replace(/\*\*/g, '')}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
