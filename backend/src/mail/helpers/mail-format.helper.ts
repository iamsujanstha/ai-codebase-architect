/**
 * Pure formatting helpers used by email templates.
 * Isolated here so templates stay declarative and helpers are independently testable.
 */

export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

export function formatDate(date: Date | string | null | undefined): string {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function providerLabel(provider: string): string {
  const map: Record<string, string> = {
    stripe: 'Stripe',
    esewa: 'eSewa',
  };
  return map[provider?.toLowerCase()] ?? provider ?? 'Online';
}
