import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueKeyToFileRecords17700000000005 implements MigrationInterface {
  name = 'AddUniqueKeyToFileRecords17700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure no duplicates exist before adding constraint (will fail otherwise)
    await queryRunner.query(`
      ALTER TABLE "file_records"
        ADD CONSTRAINT "UQ_file_records_key" UNIQUE ("key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "file_records"
      DROP CONSTRAINT "UQ_file_records_key"
    `);
  }
}
