import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseContextLength17750000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
      ALTER COLUMN context TYPE varchar(1000)
    `);
    await queryRunner.query(`
      ALTER TABLE sandbox_values
      ALTER COLUMN context TYPE varchar(1000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
      ALTER COLUMN context TYPE varchar(500)
    `);
    await queryRunner.query(`
      ALTER TABLE sandbox_values
      ALTER COLUMN context TYPE varchar(500)
    `);
  }
}
