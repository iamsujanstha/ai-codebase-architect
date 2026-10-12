/**
 * SkeletonCard - Airbnb-style luminous shimmer placeholder for ProductCard.
 * Maintains exact card geometry to eliminate layout shifts upon reload.
 */
export function SkeletonCard(): JSX.Element {
  return (
    <div className="card sk-card" aria-hidden="true">
      <div className="img sk-img sk-shimmer">
        <div className="sk-heart" />
      </div>
      <div className="meta sk-meta">
        <div className="row">
          <div className="sk-line sk-shimmer" style={{ width: '65%', height: '16px' }} />
          <div className="sk-line sk-shimmer" style={{ width: '36px', height: '16px' }} />
        </div>
        <div className="sk-line sk-shimmer" style={{ width: '50%', height: '12px', marginTop: '6px' }} />
        <div className="sk-line sk-shimmer" style={{ width: '32%', height: '12px', marginTop: '4px' }} />
        <div className="sk-line sk-shimmer" style={{ width: '28%', height: '16px', marginTop: '8px' }} />
      </div>
    </div>
  );
}


