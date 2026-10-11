interface EmptyStateProps {
  searchQuery?: string;
  onAskAI?: () => void;
}

/**
 * EmptyState - Displayed when no products match the search/filter.
 * Includes CTA to ask the AI concierge for help.
 */
export function EmptyState({ searchQuery, onAskAI }: EmptyStateProps): JSX.Element {
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
      Try another keyword, or
      <br />
      <button
        className="btn p"
        style={{ marginTop: '12px' }}
        onClick={onAskAI}
        type="button"
      >
        Ask the AI concierge
      </button>
    </p>
  );
}
