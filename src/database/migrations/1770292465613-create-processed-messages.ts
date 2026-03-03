import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProcessedMessages1770292465613
  implements MigrationInterface
{
  name = 'CreateProcessedMessages1770292465613';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message_id" uuid NOT NULL, "order_id" uuid NOT NULL, "handler" text, "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_processed_messages_message_id" ON "processed_messages" ("message_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_processed_messages_message_id"`,
    );
    await queryRunner.query(`DROP TABLE "processed_messages"`);
  }
}
