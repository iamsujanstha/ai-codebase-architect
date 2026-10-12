interface ConciergeLauncherProps {
  onClick: () => void;
  hidden?: boolean;
}

/**
 * ConciergeLauncher - Floating Action Button (FAB) to open the AI concierge.
 * Positioned at bottom-right with safe area padding.
 * Matches the .fab class from atlas-app.html.
 */
export function ConciergeLauncher(_props?: ConciergeLauncherProps): JSX.Element {
  // Floating Ask AI concierge button removed in favor of AppHeader and AdminHeader 'Ask AI' buttons
  return <></>;
}
