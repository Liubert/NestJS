import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTranslations17705000000001 implements MigrationInterface {
  name = 'CreateTranslations17705000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "translation_projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_translation_projects_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_translation_projects" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "translation_locales" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "code" text NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_translation_locales_project_code" UNIQUE ("project_id", "code"),
        CONSTRAINT "PK_translation_locales" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "translation_namespaces" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "slug" text NOT NULL,
        "original_file" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_translation_namespaces_project_slug" UNIQUE ("project_id", "slug"),
        CONSTRAINT "PK_translation_namespaces" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "translation_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "namespace_id" uuid NOT NULL,
        "key" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_translation_keys_namespace_key" UNIQUE ("namespace_id", "key"),
        CONSTRAINT "PK_translation_keys" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "translation_values" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key_id" uuid NOT NULL,
        "locale_id" uuid NOT NULL,
        "value" text,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_translation_values_key_locale" UNIQUE ("key_id", "locale_id"),
        CONSTRAINT "PK_translation_values" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_translation_locales_project" ON "translation_locales" ("project_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_translation_namespaces_project" ON "translation_namespaces" ("project_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_translation_keys_namespace" ON "translation_keys" ("namespace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_translation_values_key" ON "translation_values" ("key_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_translation_values_locale" ON "translation_values" ("locale_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "translation_locales"
        ADD CONSTRAINT "FK_translation_locales_project"
        FOREIGN KEY ("project_id") REFERENCES "translation_projects"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_namespaces"
        ADD CONSTRAINT "FK_translation_namespaces_project"
        FOREIGN KEY ("project_id") REFERENCES "translation_projects"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_keys"
        ADD CONSTRAINT "FK_translation_keys_namespace"
        FOREIGN KEY ("namespace_id") REFERENCES "translation_namespaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_values"
        ADD CONSTRAINT "FK_translation_values_key"
        FOREIGN KEY ("key_id") REFERENCES "translation_keys"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_values"
        ADD CONSTRAINT "FK_translation_values_locale"
        FOREIGN KEY ("locale_id") REFERENCES "translation_locales"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "translation_values" DROP CONSTRAINT "FK_translation_values_locale"`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_values" DROP CONSTRAINT "FK_translation_values_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_keys" DROP CONSTRAINT "FK_translation_keys_namespace"`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_namespaces" DROP CONSTRAINT "FK_translation_namespaces_project"`,
    );
    await queryRunner.query(
      `ALTER TABLE "translation_locales" DROP CONSTRAINT "FK_translation_locales_project"`,
    );
    await queryRunner.query(`DROP TABLE "translation_values"`);
    await queryRunner.query(`DROP TABLE "translation_keys"`);
    await queryRunner.query(`DROP TABLE "translation_namespaces"`);
    await queryRunner.query(`DROP TABLE "translation_locales"`);
    await queryRunner.query(`DROP TABLE "translation_projects"`);
  }
}
