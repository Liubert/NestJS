import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { ProjectMemberRole } from '../entities/project-member.entity.js';

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(['owner', 'member'] as const)
  role?: ProjectMemberRole;
}
