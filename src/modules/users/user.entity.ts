import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from './types/user-role.enum';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ type: 'text', name: 'first_name' })
  firstName!: string;

  @Column({ type: 'text', nullable: true, name: 'last_name' })
  lastName!: string | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', name: 'password_hash', select: false })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role!: UserRole;

  @Column({ type: 'uuid', name: 'avatar_file_id', nullable: true })
  avatarFileId!: string | null;
}
