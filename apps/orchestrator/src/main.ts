import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get configuration service
  const configService = app.get(ConfigService);
  
  // Set global prefix for API routes
  const apiPrefix = configService.get('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix);
  
  // Enable CORS for web UI
  app.enableCors({
    origin: [
      'http://localhost:3000', // Next.js dev server
      'http://localhost:3001', // Alternative port
      configService.get('WEB_UI_URL', 'http://localhost:3000')
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  
  // Setup WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));
  
  // Swagger API documentation
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ClipForge Orchestrator API')
      .setDescription('AI Stream Clipper orchestration and management API')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'access-token',
      )
      .addTag('streamers', 'Streamer management')
      .addTag('streams', 'Stream/VOD management')
      .addTag('chunks', 'Video chunk processing')
      .addTag('clips', 'Generated clips management')
      .addTag('jobs', 'Processing job management')
      .addTag('queue', 'Queue monitoring and control')
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }
  
  // Get port from environment
  const port = configService.get('PORT', 3002);
  
  // Start the application
  await app.listen(port);
  
  console.log(`🚀 ClipForge Orchestrator running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/${apiPrefix}/docs`);
  console.log(`🔧 Environment: ${configService.get('NODE_ENV', 'development')}`);
  console.log(`📊 Database: ${configService.get('DATABASE_HOST')}:${configService.get('DATABASE_PORT')}`);
  console.log(`🔄 Redis Queue: ${configService.get('QUEUE_REDIS_HOST')}:${configService.get('QUEUE_REDIS_PORT')}`);
  
  // Log microservice endpoints
  console.log('\n🔗 Microservice Endpoints:');
  console.log(`  📥 Ingest Service: ${configService.get('INGEST_SERVICE_URL')}`);
  console.log(`  🎤 ASR Service: ${configService.get('ASR_SERVICE_URL')}`);
  console.log(`  👁️  Vision Service: ${configService.get('VISION_SERVICE_URL')}`);
  console.log(`  📊 Scoring Service: ${configService.get('SCORING_SERVICE_URL')}`);
  console.log(`  🎬 Render Service: ${configService.get('RENDER_SERVICE_URL')}`);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrap().catch((error) => {
  console.error('💥 Failed to start application:', error);
  process.exit(1);
});