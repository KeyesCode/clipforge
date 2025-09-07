import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1757211767919 implements MigrationInterface {
    name = 'InitialSchema1757211767919'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "streamers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying NOT NULL, "displayName" character varying NOT NULL, "platform" character varying, "platformId" character varying, "avatarUrl" character varying, "description" character varying, "isActive" boolean NOT NULL DEFAULT true, "settings" json, "metadata" json, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastSyncAt" TIMESTAMP DEFAULT now(), "lastActivityAt" TIMESTAMP DEFAULT now(), CONSTRAINT "UQ_07700cfb75508d9363681aa80b3" UNIQUE ("username"), CONSTRAINT "PK_48125098658de7c988403e66e6b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."clips_status_enum" AS ENUM('pending', 'rendering', 'rendered', 'published', 'failed')`);
        await queryRunner.query(`CREATE TABLE "clips" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "stream_id" uuid NOT NULL, "chunk_id" uuid, "title" character varying(255) NOT NULL, "description" text, "status" "public"."clips_status_enum" NOT NULL DEFAULT 'pending', "start_time" double precision NOT NULL, "end_time" double precision NOT NULL, "duration" double precision NOT NULL, "highlight_score" double precision NOT NULL DEFAULT '0', "score_breakdown" jsonb, "source_file_path" character varying, "rendered_file_path" character varying, "thumbnail_path" character varying, "metadata" jsonb, "render_settings" jsonb NOT NULL, "caption_settings" jsonb NOT NULL, "publish_settings" jsonb, "processing_started_at" TIMESTAMP, "processing_completed_at" TIMESTAMP, "error_message" text, "retry_count" integer NOT NULL DEFAULT '0', "published_urls" jsonb, "published_at" TIMESTAMP, "reviewed_by" character varying, "reviewed_at" TIMESTAMP, "approval_status" character varying NOT NULL DEFAULT 'pending', "review_notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cdb959a37f95935a5d30460dc3c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_19d4b2ced9a9f9d7c5251de8d9" ON "clips" ("stream_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3ba9ad484461e9de771fa363ae" ON "clips" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_841c1bd899d8dad9878223dd42" ON "clips" ("highlight_score") `);
        await queryRunner.query(`CREATE INDEX "IDX_95d52702e30f779086c885261b" ON "clips" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_f675108eb9c2c8f6d05573893c" ON "clips" ("chunk_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_149ae8b5a9cdf808ec58dfb8fe" ON "clips" ("stream_id", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."chunks_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed')`);
        await queryRunner.query(`CREATE TABLE "chunks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "streamId" uuid NOT NULL, "title" character varying(255) NOT NULL, "description" text, "startTime" double precision NOT NULL, "endTime" double precision NOT NULL, "duration" double precision NOT NULL, "status" "public"."chunks_status_enum" NOT NULL DEFAULT 'pending', "videoPath" character varying(500), "audioPath" character varying(500), "thumbnailPath" character varying(500), "transcription" jsonb, "audioFeatures" jsonb, "visualFeatures" jsonb, "highlightScore" double precision, "scoreBreakdown" jsonb, "rank" integer, "processedAt" TIMESTAMP, "transcribedAt" TIMESTAMP, "analyzedAt" TIMESTAMP, "scoredAt" TIMESTAMP, "errorMessage" text, "retryCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "processingError" text, CONSTRAINT "PK_a306e60b8fdf6e7de1be4be1e6a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6a50a23ebb813dfadab321c675" ON "chunks" ("streamId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c361f752bbfe8af03bcbe48f1e" ON "chunks" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_3be19f1e7535e25a8bcef1b832" ON "chunks" ("streamId", "startTime") `);
        await queryRunner.query(`CREATE TYPE "public"."streams_platform_enum" AS ENUM('twitch', 'youtube', 'kick')`);
        await queryRunner.query(`CREATE TYPE "public"."streams_status_enum" AS ENUM('pending', 'downloading', 'processing', 'downloaded', 'completed', 'failed', 'published')`);
        await queryRunner.query(`CREATE TABLE "streams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "description" text, "originalUrl" character varying(500) NOT NULL, "videoId" character varying(255), "platform" "public"."streams_platform_enum" NOT NULL, "status" "public"."streams_status_enum" NOT NULL DEFAULT 'pending', "duration" integer, "thumbnailUrl" character varying(500), "localVideoPath" character varying(500), "localAudioPath" character varying(500), "localThumbnailPath" character varying(500), "fileSize" bigint, "videoCodec" character varying(50), "audioCodec" character varying(50), "width" integer, "height" integer, "fps" double precision, "bitrate" integer, "streamDate" TIMESTAMP, "viewCount" integer NOT NULL DEFAULT '0', "totalChunks" integer NOT NULL DEFAULT '0', "processingProgress" integer NOT NULL DEFAULT '0', "currentStage" character varying(50), "progressMessage" character varying(255), "estimatedTimeRemaining" integer, "downloadedBytes" bigint, "totalBytes" bigint, "metadata" jsonb, "errorMessage" text, "retryCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "streamerId" uuid NOT NULL, CONSTRAINT "PK_40440b6f569ebc02bc71c25c499" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_type_enum" AS ENUM('ingest_stream', 'download-stream', 'process-stream', 'generate_highlights', 'render_clip', 'publish_clip', 'transcribe_chunk', 'analyze_vision', 'score_clip')`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_status_enum" AS ENUM('pending', 'running', 'processing', 'completed', 'failed', 'cancelled', 'retrying')`);
        await queryRunner.query(`CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."jobs_type_enum" NOT NULL, "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'pending', "priority" integer NOT NULL DEFAULT '1', "data" jsonb, "result" jsonb, "errorMessage" text, "errorStack" text, "retryCount" integer NOT NULL DEFAULT '0', "maxRetries" integer NOT NULL DEFAULT '3', "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "scheduledFor" TIMESTAMP, "workerId" character varying(255), "progress" integer, "progressMessage" text, "streamerId" uuid, "streamId" uuid, "clipId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."queues_type_enum" AS ENUM('ingest', 'transcribe', 'vision', 'scoring', 'render', 'publish', 'notification')`);
        await queryRunner.query(`CREATE TYPE "public"."queues_status_enum" AS ENUM('active', 'paused', 'draining', 'error')`);
        await queryRunner.query(`CREATE TABLE "queues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "type" "public"."queues_type_enum" NOT NULL, "status" "public"."queues_status_enum" NOT NULL DEFAULT 'active', "concurrency" integer NOT NULL DEFAULT '1', "waiting" integer NOT NULL DEFAULT '0', "active" integer NOT NULL DEFAULT '0', "completed" integer NOT NULL DEFAULT '0', "failed" integer NOT NULL DEFAULT '0', "delayed" integer NOT NULL DEFAULT '0', "paused" integer NOT NULL DEFAULT '0', "config" jsonb, "metrics" jsonb, "description" text, "workerId" character varying(255), "lastProcessedAt" TIMESTAMP, "lastErrorAt" TIMESTAMP, "lastError" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a290d70c28ba7f1c5d2600da849" UNIQUE ("name"), CONSTRAINT "PK_d966f9eb39a9396658387071bb3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "clips" ADD CONSTRAINT "FK_19d4b2ced9a9f9d7c5251de8d98" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "clips" ADD CONSTRAINT "FK_f675108eb9c2c8f6d05573893ca" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chunks" ADD CONSTRAINT "FK_6a50a23ebb813dfadab321c6753" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "streams" ADD CONSTRAINT "FK_efd4646cd34655b0382708ed3a2" FOREIGN KEY ("streamerId") REFERENCES "streamers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_3f3b72492433212bab599cffb89" FOREIGN KEY ("streamerId") REFERENCES "streamers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_f61a65eda6c119f94aaab7c39c6" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_38a235ac8eca154eba5f6b4be89" FOREIGN KEY ("clipId") REFERENCES "clips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_38a235ac8eca154eba5f6b4be89"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_f61a65eda6c119f94aaab7c39c6"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_3f3b72492433212bab599cffb89"`);
        await queryRunner.query(`ALTER TABLE "streams" DROP CONSTRAINT "FK_efd4646cd34655b0382708ed3a2"`);
        await queryRunner.query(`ALTER TABLE "chunks" DROP CONSTRAINT "FK_6a50a23ebb813dfadab321c6753"`);
        await queryRunner.query(`ALTER TABLE "clips" DROP CONSTRAINT "FK_f675108eb9c2c8f6d05573893ca"`);
        await queryRunner.query(`ALTER TABLE "clips" DROP CONSTRAINT "FK_19d4b2ced9a9f9d7c5251de8d98"`);
        await queryRunner.query(`DROP TABLE "queues"`);
        await queryRunner.query(`DROP TYPE "public"."queues_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."queues_type_enum"`);
        await queryRunner.query(`DROP TABLE "jobs"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_type_enum"`);
        await queryRunner.query(`DROP TABLE "streams"`);
        await queryRunner.query(`DROP TYPE "public"."streams_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."streams_platform_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3be19f1e7535e25a8bcef1b832"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c361f752bbfe8af03bcbe48f1e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c361f752bbfe8af03bcbe48f1e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6a50a23ebb813dfadab321c675"`);
        await queryRunner.query(`DROP TABLE "chunks"`);
        await queryRunner.query(`DROP TYPE "public"."chunks_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_149ae8b5a9cdf808ec58dfb8fe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f675108eb9c2c8f6d05573893c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_95d52702e30f779086c885261b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_841c1bd899d8dad9878223dd42"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_841c1bd899d8dad9878223dd42"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3ba9ad484461e9de771fa363ae"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_19d4b2ced9a9f9d7c5251de8d9"`);
        await queryRunner.query(`DROP TABLE "clips"`);
        await queryRunner.query(`DROP TYPE "public"."clips_status_enum"`);
        await queryRunner.query(`DROP TABLE "streamers"`);
    }

}
