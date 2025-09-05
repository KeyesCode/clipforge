import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

// Parse DATABASE_URL if available, otherwise use individual environment variables
function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl) {
    // Parse the DATABASE_URL (format: postgresql://username:password@host:port/database)
    const url = new URL(databaseUrl);
    return {
      type: 'postgres' as const,
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading slash
    };
  }
  
  // Fallback to individual environment variables
  return {
    type: 'postgres' as const,
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME || 'clipforge',
    password: process.env.DATABASE_PASSWORD || 'clipforge',
    database: process.env.DATABASE_NAME || 'clipforge',
  };
}

const dbConfig = getDatabaseConfig();

export const AppDataSource = new DataSource({
  ...dbConfig,
  entities: [
    'src/**/*.entity.ts',
    'dist/**/*.entity.js',
  ],
  migrations: [
    'src/migrations/*.ts',
    'dist/migrations/*.js',
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  migrationsRun: false,
});
