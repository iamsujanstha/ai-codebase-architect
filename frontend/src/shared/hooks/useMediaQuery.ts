import { useEffect, useState } from 'react';

/**
 * Hook to track media query matches.
 * Used for responsive breakpoints in the Airbnb-style design.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial value
    setMatches(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}

/**
 * Predefined breakpoint hooks matching the design system
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 699px)');
}

export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 700px) and (max-width: 1099px)');
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1100px)');
}

export function useIsWideLayout(): boolean {
  return useMediaQuery('(min-width: 1100px)');
}
