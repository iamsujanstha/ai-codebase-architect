interface EmptyStateProps {
  searchQuery?: string;
  onAskAI?: () => void;
}

/**
 * EmptyState - Displayed when no products match the search/filter.
 */
export function EmptyState({ searchQuery }: EmptyStateProps): JSX.Element {
  return (
    <p className="sub" style={{ 
      gridColumn: '1 / -1', 
      textAlign: 'center', 
      padding: '48px 0' 
    }}>
      <b style={{ color: 'var(--ink)', fontSize: '18px' }}>
        {searchQuery ? `No matches for "${searchQuery}"` : 'No matches yet'}
      </b>
      <br />
      Try another keyword or category filter.
    </p>
  );
}
