import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsIndexes17700000000001 implements MigrationInterface {
  name = 'AddProductsIndexes17700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Infinite scroll / listing: WHERE is_active + ORDER BY created_at DESC, id DESC
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_products_active_created_at_id_desc
      ON products (created_at DESC, id DESC)
      WHERE is_active = true;
    `);

    // 2) Price range filter (optional but useful)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_products_active_price
      ON products (price)
      WHERE is_active = true;
    `);

    // 3) Trigram extension for ILIKE '%term%'
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);

    // 4) GIN trigram index for name search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_products_name_trgm
      ON products USING gin (name gin_trgm_ops);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_name_trgm;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_active_price;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_products_active_created_at_id_desc;`,
    );

    // Usually don't drop extensions in down migrations.
    // await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm;`);
  }
}
