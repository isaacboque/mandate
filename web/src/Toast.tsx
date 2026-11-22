/** An Undo toast: announced politely (role="status"), reachable by keyboard, and clear of the notch and the home indicator. */
export function Toast({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div className="toast" role="status">
      <span>{label}</span>
      <button type="button" className="toast-undo" onClick={onUndo}>Undo</button>
    </div>
  );
}
