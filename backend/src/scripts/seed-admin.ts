import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import * as bcrypt from 'bcrypt';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const adminName = process.env.ADMIN_NAME || 'Admin User';

  try {
    // Check if admin already exists
    const existingAdmin = await usersService.findByEmail(adminEmail);
    
    if (existingAdmin) {
      console.log(`Admin user already exists: ${adminEmail}`);
      
      // Update to admin role if not already
      if (existingAdmin.role !== UserRole.ADMIN) {
        await usersService.update(existingAdmin._id.toString(), {
          role: UserRole.ADMIN,
        });
        console.log(`Updated ${adminEmail} to admin role`);
      }
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await usersService.create({
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: UserRole.ADMIN,
        isActive: true,
      });

      console.log('✅ Admin user created successfully!');
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
      console.log('\n⚠️  Please change the password after first login!');
    }
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

seedAdmin();
