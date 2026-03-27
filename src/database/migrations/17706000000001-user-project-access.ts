import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProjectAccess17706000000001 implements MigrationInterface {
  name = 'UserProjectAccess17706000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Users: audit + forced-change flag ──────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false`,
    );

    // ── Projects: owner FK ─────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "translation_projects" ADD COLUMN "owner_id" UUID NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_projects"
       ADD CONSTRAINT "FK_translation_projects_owner"
       FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // ── project_members ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "project_members" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid         NOT NULL,
        "user_id"    uuid         NOT NULL,
        "role"       text         NOT NULL DEFAULT 'member',
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_project_members_project_user" UNIQUE ("project_id", "user_id"),
        CONSTRAINT "PK_project_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_members_project"
          FOREIGN KEY ("project_id") REFERENCES "translation_projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_members_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_members_user" ON "project_members" ("user_id")`,
    );

    // ── password_reset_tokens ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid        NOT NULL,
        "token_hash" text        NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at"    TIMESTAMPTZ NULL,
        CONSTRAINT "UQ_password_reset_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_user" ON "password_reset_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_user"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "IDX_project_members_user"`);
    await queryRunner.query(`DROP TABLE "project_members"`);
    await queryRunner.query(
      `ALTER TABLE "translation_projects" DROP CONSTRAINT "FK_translation_projects_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_projects" DROP COLUMN "owner_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "must_change_password"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "created_at"`);
  }
}
