import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService, UserRole } from '../users/users.service';
import { PostgresService } from '../database/postgres.service';
import * as bcrypt from 'bcrypt';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const pg = app.get(PostgresService);

  const hashedPassword = await bcrypt.hash('password', 10);

  // 1. Seed Users (1 admin + customers + 1 suspended)
  const usersToSeed = [
    {
      email: 'admin@atlas.dev',
      name: 'Sujan Shrestha',
      role: UserRole.ADMIN,
      isActive: true,
      status: 'active',
    },
    {
      email: 'aarav@mail.com',
      name: 'Aarav Sharma',
      role: UserRole.CUSTOMER,
      isActive: true,
      status: 'active',
    },
    {
      email: 'maya@mail.com',
      name: 'Maya Patel',
      role: UserRole.CUSTOMER,
      isActive: true,
      status: 'active',
    },
    {
      email: 'daniel@mail.com',
      name: 'Daniel Kim',
      role: UserRole.CUSTOMER,
      isActive: false,
      status: 'suspended',
    },
    {
      email: 'sita@mail.com',
      name: 'Sita Rai',
      role: UserRole.CUSTOMER,
      isActive: true,
      status: 'active',
    },
    {
      email: 'leo@mail.com',
      name: 'Leo Martin',
      role: UserRole.CUSTOMER,
      isActive: true,
      status: 'active',
    },
    {
      email: 'priya@mail.com',
      name: 'Priya Nair',
      role: UserRole.ADMIN,
      isActive: true,
      status: 'active',
    },
  ];

  try {
    for (const u of usersToSeed) {
      const existing = await usersService.findByEmail(u.email);
      if (existing) {
        await usersService.update(existing._id.toString(), {
          name: u.name,
          role: u.role,
          isActive: u.isActive,
          status: u.status,
          password: hashedPassword,
        });
      } else {
        await usersService.create({
          ...u,
          password: hashedPassword,
        });
      }
    }
    console.log(
      '✅ Users seeded successfully! Admin: admin@atlas.dev / password',
    );

    // 2. Seed Sample Products from atlas-admin.html
    const sampleProducts = [
      {
        title: 'Walnut standing desk',
        category: 'desk',
        price: 649,
        stock: 12,
        status: 'published',
        description: 'Electric height-adjustable desk in solid walnut.',
        sku: 'ATL-1001',
      },
      {
        title: 'Halo monitor light bar',
        category: 'lighting',
        price: 69,
        stock: 4,
        status: 'published',
        description:
          'Screenbar with adjustable temperature and ambient backlighting.',
        sku: 'ATL-1002',
      },
      {
        title: 'Low-profile keyboard',
        category: 'keyboard',
        price: 129,
        stock: 0,
        status: 'published',
        description:
          'Ultra-thin mechanical keyboard with hot-swappable switches.',
        sku: 'ATL-1003',
      },
      {
        title: 'Studio headphones',
        category: 'audio',
        price: 249,
        stock: 31,
        status: 'published',
        description:
          'Open-back planar magnetic headphones for mixing and critical listening.',
        sku: 'ATL-1004',
      },
      {
        title: '34" ultrawide display',
        category: 'display',
        price: 499,
        stock: 8,
        status: 'draft',
        description:
          'Curved WQHD productivity monitor with 90W USB-C power delivery.',
        sku: 'ATL-1005',
      },
      {
        title: 'Felt desk mat',
        category: 'accessory',
        price: 39,
        stock: 120,
        status: 'published',
        description:
          'Anti-slip wool felt pad for comfortable typing and mouse movement.',
        sku: 'ATL-1006',
      },
      {
        title: 'Dual monitor arm',
        category: 'desk',
        price: 119,
        stock: 22,
        status: 'published',
        description:
          'Heavy-duty gas spring dual monitor mount for up to 32" screens.',
        sku: 'ATL-1007',
      },
      {
        title: 'Warm task lamp',
        category: 'lighting',
        price: 54,
        stock: 3,
        status: 'draft',
        description: 'Minimalist brass desk lamp with warm 2700K illumination.',
        sku: 'ATL-1008',
      },
    ];

    for (const p of sampleProducts) {
      const existingProduct = await pg.query(
        'SELECT id FROM products WHERE name = $1 LIMIT 1;',
        [p.title],
      );
      if (existingProduct.rows.length === 0) {
        await pg.query(
          `INSERT INTO products (name, description, price, stock, category, status, sku, featured, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW());`,
          [p.title, p.description, p.price, p.stock, p.category, p.status, p.sku],
        );
      }
    }
    console.log('✅ Products seeded successfully in PostgreSQL via pg pool!');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

void seedAdmin();
