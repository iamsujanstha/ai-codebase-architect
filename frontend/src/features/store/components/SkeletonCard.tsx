/**
 * SkeletonCard - Loading placeholder for ProductCard.
 * Uses the pulse animation defined in atlas-app.html styles.
 */
export function SkeletonCard(): JSX.Element {
  return (
    <div className="card sk" aria-hidden="true">
      <div className="img" />
      <div className="l" style={{ width: '75%' }} />
      <div className="l" style={{ width: '45%', height: '12px', marginTop: '6px' }} />
      <div className="l" style={{ width: '30%', height: '14px', marginTop: '10px' }} />
    </div>
  );
}

