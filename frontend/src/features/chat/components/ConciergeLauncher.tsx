import { Sparkles } from 'lucide-react';

interface ConciergeLauncherProps {
  onClick: () => void;
  hidden?: boolean;
}

/**
 * ConciergeLauncher - Floating Action Button (FAB) to open the AI concierge.
 * Positioned at bottom-right with safe area padding.
 * Matches the .fab class from atlas-app.html.
 */
export function ConciergeLauncher({ onClick, hidden = false }: ConciergeLauncherProps): JSX.Element {
  if (hidden) {
    return <></>;
  }

  return (
    <button
      className="fab"
      onClick={onClick}
      type="button"
      aria-label="Open AI concierge"
    >
      <Sparkles size={16} />
      Ask AI concierge
    </button>
  );
}
