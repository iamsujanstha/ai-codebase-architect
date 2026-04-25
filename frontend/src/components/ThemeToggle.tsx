import type { ThemeMode } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

export function ThemeToggle({
  theme,
  onThemeChange,
}: ThemeToggleProps): JSX.Element {
  return (
    <div className="theme-toggle" role="group" aria-label="Theme switcher">
      <button
        className={`theme-option ${theme === 'light' ? 'active' : ''}`}
        type="button"
        onClick={() => onThemeChange('light')}
      >
        Light
      </button>
      <button
        className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
        type="button"
        onClick={() => onThemeChange('dark')}
      >
        Dark
      </button>
    </div>
  );
}

