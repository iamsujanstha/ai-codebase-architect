export interface SystemCounts {
  products: number;
  users: number;
  orders: number;
}

export interface IHealthRepository {
  isDatabaseReady(): boolean;
  getSystemCounts(): Promise<SystemCounts>;
}

export const HEALTH_REPOSITORY_TOKEN = Symbol('IHealthRepository');
