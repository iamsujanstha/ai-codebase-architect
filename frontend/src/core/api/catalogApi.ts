import { ApiError } from '@/core/api/aiApi';
import type { ApiErrorResponse } from '@/core/types/api';
import type {
  CatalogHomeResponse,
  CatalogProductDetailResponse,
  CatalogProductsResponse,
  CatalogCategory,
} from '@/core/types/catalog';

const REQUEST_TIMEOUT_MS = 15000;

function extractErrorMessage(errorPayload: Partial<ApiErrorResponse> | null): string {
  if (!errorPayload) {
    return 'The backend returned an unexpected storefront error.';
  }

  if (Array.isArray(errorPayload.message)) {
    return errorPayload.message.join(', ');
  }

  if (typeof errorPayload.message === 'string' && errorPayload.message.trim()) {
    return errorPayload.message;
  }

  if (typeof errorPayload.detail === 'string' && errorPayload.detail.trim()) {
    return errorPayload.detail;
  }

  return 'The backend returned an unexpected storefront error.';
}

async function fetchWithTimeout<T>(input: string): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorPayload = (await response.json()) as ApiErrorResponse;
      throw new ApiError(extractErrorMessage(errorPayload), response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'The storefront request timed out while waiting for the backend.',
        408,
      );
    }

    throw new ApiError(
      'The storefront could not reach the backend catalog service.',
      503,
    );
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

export function fetchCatalogHome(): Promise<CatalogHomeResponse> {
  return fetchWithTimeout<CatalogHomeResponse>('/catalog/home');
}

export function fetchCatalogProducts(options?: {
  category?: string;
  search?: string;
  featured?: boolean;
  limit?: number;
  skip?: number;
}): Promise<CatalogProductsResponse> {
  const queryParams = new URLSearchParams();

  if (options?.category) {
    queryParams.set('category', options.category);
  }

  if (options?.search) {
    queryParams.set('search', options.search);
  }

  if (options?.featured !== undefined) {
    queryParams.set('featured', String(options.featured));
  }

  if (options?.limit !== undefined) {
    queryParams.set('limit', String(options.limit));
  }

  if (options?.skip !== undefined) {
    queryParams.set('skip', String(options.skip));
  }


  const suffix = queryParams.toString();
  const path = suffix ? `/catalog/products?${suffix}` : '/catalog/products';

  return fetchWithTimeout<CatalogProductsResponse>(path);
}

export function fetchCatalogProduct(
  slug: string,
): Promise<CatalogProductDetailResponse> {
  return fetchWithTimeout<CatalogProductDetailResponse>(
    `/catalog/products/${slug}`,
  );
}

export function fetchCategories(): Promise<CatalogCategory[]> {
  return fetchWithTimeout<CatalogCategory[]>('/catalog/categories');
}

export async function seedProducts(count = 4): Promise<unknown[]> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/catalog/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = (await response.json()) as ApiErrorResponse;
      throw new ApiError(extractErrorMessage(err), response.status);
    }
    return (await response.json()) as unknown[];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Failed to seed products.', 503);
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

export async function createProduct(data: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/catalog/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = (await response.json()) as ApiErrorResponse;
      throw new ApiError(extractErrorMessage(err), response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Failed to create product.', 503);
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}
