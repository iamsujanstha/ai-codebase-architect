/**
 * SkeletonCard - Loading placeholder for ProductCard.
 * Uses the pulse animation defined in atlas-app.html styles.
 */
export function SkeletonCard(): JSX.Element {
  return (
    <div className="card sk">
      <div className="img" />
      <div className="l" style={{ width: '70%' }} />
      <div className="l" style={{ width: '45%' }} />
    </div>
  );
}
