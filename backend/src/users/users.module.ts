import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { PostgresUsersRepository } from './repositories/postgres-users.repository';
import { USERS_REPOSITORY_TOKEN } from './repositories/users.repository.interface';

@Module({
  providers: [
    UsersService,
    PostgresUsersRepository,
    {
      provide: USERS_REPOSITORY_TOKEN,
      useClass: PostgresUsersRepository,
    },
  ],
  exports: [UsersService, USERS_REPOSITORY_TOKEN, PostgresUsersRepository],
})
export class UsersModule {}

