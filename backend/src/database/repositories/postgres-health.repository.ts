import { Injectable } from '@nestjs/common';
import { PostgresService } from '../postgres.service';
import { IHealthRepository, SystemCounts } from './health.repository.interface';

@Injectable()
export class PostgresHealthRepository implements IHealthRepository {
  constructor(private readonly pg: PostgresService) {}

  isDatabaseReady(): boolean {
    return this.pg.isReady();
  }

  async getSystemCounts(): Promise<SystemCounts> {
    const [prodCount, userCount, orderCount] = await Promise.all([
      this.pg.query<{ count: string }>('SELECT COUNT(*) FROM products'),
      this.pg.query<{ count: string }>('SELECT COUNT(*) FROM users'),
      this.pg.query<{ count: string }>('SELECT COUNT(*) FROM orders'),
    ]);

    return {
      products: parseInt(prodCount.rows[0]?.count || '0', 10),
      users: parseInt(userCount.rows[0]?.count || '0', 10),
      orders: parseInt(orderCount.rows[0]?.count || '0', 10),
    };
  }
}
