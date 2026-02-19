import { NotFoundException, UseGuards } from '@nestjs/common';
import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import { UsersService } from '../../modules/users/users.service';
import { FilesService } from '../../modules/files/files.service';
import { OrdersService } from '../../modules/orders/orders.service';

import { CurrentUser } from '../../modules/auth/current-user.decorator';

import type { CurrentUserType } from '../../modules/users/types/current-user.type';

import { GqlUser } from './user.model';
import { Order } from '../orders/order.model';
import { mapOrderEntityToGraphQL } from '../orders/order.mapper';
import { PaginationInput } from '../common/pagination.input';
import { UserEntity } from '../../modules/users/user.entity';
import { UsersPayload } from './users.payload';
import { Roles } from '../../modules/auth/role.decorator';
import { UserRole } from '../../modules/users/types/user-role.enum';
import { GqlAuthGuard } from '../../modules/auth/qgl-jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/roles.guard';
import { FileRecordLoader } from './file-record.loader';
import { FileStatus } from '../../modules/files/file-record.entity';

type MePayload = Omit<GqlUser, 'orders' | 'avatarUrl'>;

const mapUserEntityToGraphQL = (u: UserEntity): GqlUser => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  phone: u.phone,
  role: u.role,
  avatarFileId: u.avatarFileId ?? null,
  avatarUrl: null, // resolved via @ResolveField
  orders: [], // resolved via @ResolveField
});

@Resolver(() => GqlUser)
export class UserResolver {
  constructor(
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
    private readonly ordersService: OrdersService,
    private readonly fileRecordLoader: FileRecordLoader,
  ) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => GqlUser, { name: 'me' })
  async me(@CurrentUser() currentUser: CurrentUserType): Promise<MePayload> {
    const entity = await this.usersService.findById(currentUser.userId);
    if (!entity) throw new NotFoundException('User not found');

    return mapUserEntityToGraphQL(entity);
  }

  @ResolveField(() => String, { nullable: true })
  async avatarUrl(@Parent() user: GqlUser): Promise<string | null> {
    if (!user.avatarFileId) return null;

    const file = await this.fileRecordLoader.byId.load(user.avatarFileId);
    if (!file) return null;

    if (file.status !== FileStatus.READY) return null;

    // Generate view URL (presigned GET or CloudFront) based existing logic
    return this.filesService.getViewUrl(file);
  }

  @ResolveField(() => [Order])
  async orders(@Parent() user: GqlUser): Promise<Order[]> {
    const entities = await this.ordersService.findByUserId(user.id);
    return entities.map(mapOrderEntityToGraphQL);
  }

  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Query(() => UsersPayload, { name: 'users' })
  async users(
    @Args('pagination', { nullable: true }) pagination: PaginationInput,
  ): Promise<UsersPayload> {
    const { items, total } =
      await this.usersService.getPaginatedUsers(pagination);
    return { items: items.map(mapUserEntityToGraphQL), total };
  }
}
