import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFileRecords17700000000003 implements MigrationInterface {
  name = 'CreateFileRecords17700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "file_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_id" uuid NOT NULL,
        "entity_id" uuid,
        "key" text NOT NULL,
        "content_type" text NOT NULL,
        "size" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "visibility" text NOT NULL DEFAULT 'private',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_file_records_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_file_records_owner_id" ON "file_records" ("owner_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_file_records_entity_id" ON "file_records" ("entity_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "file_records"`);
  }
}
