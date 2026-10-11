import { useEffect, useState } from 'react';
import { Moon } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

/**
 * ThemeToggle - Icon button to toggle between light, dark, and system themes.
 * Matches the Airbnb-style design with proper accessibility.
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => {
    // Get saved theme or default to system
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as Theme | null;
      return saved || 'system';
    }
    return 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    
    const applyTheme = (themeToApply: Theme) => {
      if (themeToApply === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', themeToApply);
      }
    };

    applyTheme(theme);
    localStorage.setItem('theme', theme);

    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const handleToggle = () => {
    // Toggle between light and dark (simplified from the reference)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (document.documentElement.getAttribute('data-theme') === null && 
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    const nextTheme = isDark ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <button
      className="icon-btn"
      onClick={handleToggle}
      aria-label="Toggle dark mode"
      type="button"
    >
      <Moon size={20} />
    </button>
  );
}
