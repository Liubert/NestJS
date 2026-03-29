import { IsEmail, IsIn, IsOptional } from 'class-validator';
import type { ProjectMemberRole } from '../entities/project-member.entity.js';

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: ProjectMemberRole;
}
