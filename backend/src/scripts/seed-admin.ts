import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../catalog/schemas/product.schema';
import * as bcrypt from 'bcrypt';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const productModel = app.get<Model<ProductDocument>>(
    getModelToken(Product.name),
  );

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
        price: 64900,
        stock: 12,
        status: 'published',
        description: 'Electric height-adjustable desk in solid walnut.',
        sku: 'ATL-1001',
      },
      {
        title: 'Halo monitor light bar',
        category: 'lighting',
        price: 6900,
        stock: 4,
        status: 'published',
        description:
          'Screenbar with adjustable temperature and ambient backlighting.',
        sku: 'ATL-1002',
      },
      {
        title: 'Low-profile keyboard',
        category: 'keyboard',
        price: 12900,
        stock: 0,
        status: 'published',
        description:
          'Ultra-thin mechanical keyboard with hot-swappable switches.',
        sku: 'ATL-1003',
      },
      {
        title: 'Studio headphones',
        category: 'audio',
        price: 24900,
        stock: 31,
        status: 'published',
        description:
          'Open-back planar magnetic headphones for mixing and critical listening.',
        sku: 'ATL-1004',
      },
      {
        title: '34" ultrawide display',
        category: 'display',
        price: 49900,
        stock: 8,
        status: 'draft',
        description:
          'Curved WQHD productivity monitor with 90W USB-C power delivery.',
        sku: 'ATL-1005',
      },
      {
        title: 'Felt desk mat',
        category: 'accessory',
        price: 3900,
        stock: 120,
        status: 'published',
        description:
          'Anti-slip wool felt pad for comfortable typing and mouse movement.',
        sku: 'ATL-1006',
      },
      {
        title: 'Dual monitor arm',
        category: 'desk',
        price: 11900,
        stock: 22,
        status: 'published',
        description:
          'Heavy-duty gas spring dual monitor mount for up to 32" screens.',
        sku: 'ATL-1007',
      },
      {
        title: 'Warm task lamp',
        category: 'lighting',
        price: 5400,
        stock: 3,
        status: 'draft',
        description: 'Minimalist brass desk lamp with warm 2700K illumination.',
        sku: 'ATL-1008',
      },
    ];

    for (const p of sampleProducts) {
      const slug = p.title
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^\w-]+/g, '');
      const existingProduct = await productModel.findOne({ slug });
      if (!existingProduct) {
        await productModel.create({
          name: p.title,
          slug,
          subtitle: p.description,
          shortDescription: p.description,
          description: p.description,
          price: p.price,
          currency: 'USD',
          inventoryCount: p.stock,
          categorySlug: p.category,
          categoryName: p.category,
          status: p.status,
          sku: p.sku,
          imageUrl: '',
          rating: 5.0,
          reviewCount: 12,
          heroBadge: 'Admin Pick',
          featured: true,
          bestSeller: false,
          newArrival: false,
          visual: {
            gradientFrom: '#ff385c',
            gradientTo: '#a93bff',
            accent: '#ff385c',
            glyph: 'box',
          },
          specs: [],
          deletedAt: null,
        });
      }
    }
    console.log('✅ Products seeded successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

void seedAdmin();
