import type { CurrentUserType } from '../../users/types/current-user.type';
import type { Request } from 'express';

export type ReqWithUser = Request & {
  user?: CurrentUserType;
};
export type GqlContextWithReq = { req: ReqWithUser };
