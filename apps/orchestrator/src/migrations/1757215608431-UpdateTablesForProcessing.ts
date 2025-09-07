import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTablesForProcessing1757215608431 implements MigrationInterface {
    name = 'UpdateTablesForProcessing1757215608431'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clips" ADD "source_chunk_id" character varying`);
        await queryRunner.query(`ALTER TABLE "clips" ADD "score" double precision`);
        await queryRunner.query(`ALTER TABLE "clips" ADD "rendered_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "chunks" ADD "visionAnalysis" jsonb`);
        await queryRunner.query(`ALTER TABLE "chunks" ADD "score" double precision`);
        await queryRunner.query(`DROP INDEX "public"."IDX_149ae8b5a9cdf808ec58dfb8fe"`);
        await queryRunner.query(`ALTER TYPE "public"."clips_status_enum" RENAME TO "clips_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."clips_status_enum" AS ENUM('pending', 'pending_render', 'rendering', 'rendered', 'published', 'failed')`);
        await queryRunner.query(`ALTER TABLE "clips" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "clips" ALTER COLUMN "status" TYPE "public"."clips_status_enum" USING "status"::"text"::"public"."clips_status_enum"`);
        await queryRunner.query(`ALTER TABLE "clips" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."clips_status_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."chunks_status_enum" RENAME TO "chunks_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."chunks_status_enum" AS ENUM('pending', 'processing', 'transcribed', 'analyzed', 'scored', 'completed', 'failed')`);
        await queryRunner.query(`ALTER TABLE "chunks" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "chunks" ALTER COLUMN "status" TYPE "public"."chunks_status_enum" USING "status"::"text"::"public"."chunks_status_enum"`);
        await queryRunner.query(`ALTER TABLE "chunks" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."chunks_status_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."streams_status_enum" RENAME TO "streams_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."streams_status_enum" AS ENUM('pending', 'downloading', 'processing', 'downloaded', 'processed', 'completed', 'failed', 'published')`);
        await queryRunner.query(`ALTER TABLE "streams" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "streams" ALTER COLUMN "status" TYPE "public"."streams_status_enum" USING "status"::"text"::"public"."streams_status_enum"`);
        await queryRunner.query(`ALTER TABLE "streams" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."streams_status_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_149ae8b5a9cdf808ec58dfb8fe" ON "clips" ("stream_id", "status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_149ae8b5a9cdf808ec58dfb8fe"`);
        await queryRunner.query(`CREATE TYPE "public"."streams_status_enum_old" AS ENUM('pending', 'downloading', 'processing', 'downloaded', 'completed', 'failed', 'published')`);
        await queryRunner.query(`ALTER TABLE "streams" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "streams" ALTER COLUMN "status" TYPE "public"."streams_status_enum_old" USING "status"::"text"::"public"."streams_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "streams" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."streams_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."streams_status_enum_old" RENAME TO "streams_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."chunks_status_enum_old" AS ENUM('pending', 'processing', 'completed', 'failed')`);
        await queryRunner.query(`ALTER TABLE "chunks" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "chunks" ALTER COLUMN "status" TYPE "public"."chunks_status_enum_old" USING "status"::"text"::"public"."chunks_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "chunks" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."chunks_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."chunks_status_enum_old" RENAME TO "chunks_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."clips_status_enum_old" AS ENUM('pending', 'rendering', 'rendered', 'published', 'failed')`);
        await queryRunner.query(`ALTER TABLE "clips" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "clips" ALTER COLUMN "status" TYPE "public"."clips_status_enum_old" USING "status"::"text"::"public"."clips_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "clips" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."clips_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."clips_status_enum_old" RENAME TO "clips_status_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_149ae8b5a9cdf808ec58dfb8fe" ON "clips" ("stream_id", "status") `);
        await queryRunner.query(`ALTER TABLE "chunks" DROP COLUMN "score"`);
        await queryRunner.query(`ALTER TABLE "chunks" DROP COLUMN "visionAnalysis"`);
        await queryRunner.query(`ALTER TABLE "clips" DROP COLUMN "rendered_at"`);
        await queryRunner.query(`ALTER TABLE "clips" DROP COLUMN "score"`);
        await queryRunner.query(`ALTER TABLE "clips" DROP COLUMN "source_chunk_id"`);
    }

}
