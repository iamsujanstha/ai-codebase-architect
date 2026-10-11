interface CatalogErrorBannerProps {
  onRetry: () => void;
}

/**
 * CatalogErrorBanner - Error state when catalog service is unreachable.
 * Matches the banner design from atlas-app.html.
 */
export function CatalogErrorBanner({ onRetry }: CatalogErrorBannerProps): JSX.Element {
  return (
    <div className="banner">
      <div>
        <b>Can't reach the catalog service</b>
        <p>
          Showing sample products. Check that the backend is running, then retry.
        </p>
      </div>
      <button className="btn" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}
