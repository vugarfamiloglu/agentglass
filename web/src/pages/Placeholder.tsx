export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="panel empty-panel">
        <div className="empty-glyph mono">◍</div>
        <div className="empty-title">{title}</div>
        <div className="empty-note">{note}</div>
      </div>
    </div>
  );
}
