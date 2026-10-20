import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProvisioningService {
  constructor(private readonly db: DatabaseService) {}

  // Database name is built only from hex characters, so it is safe to use in SQL
  dbNameFor(projectId: string): string {
    return 'baas_proj_' + projectId.replace(/[^a-f0-9]/gi, '').toLowerCase();
  }

  async createProjectDatabase(projectId: string): Promise<string> {
    const name = this.dbNameFor(projectId);
    await this.db.query(
      `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      [],
    );
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS \`${name}\`.resources (
        id CHAR(36) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      [],
    );
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS \`${name}\`.records (
        id CHAR(36) NOT NULL PRIMARY KEY,
        resource_id CHAR(36) NOT NULL,
        data JSON NOT NULL,
        created_by CHAR(36) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_records_resource_created (resource_id, created_at)
      ) ENGINE=InnoDB`,
      [],
    );
    return name;
  }
}
