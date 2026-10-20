import { ProvisioningService } from '../provisioning/provisioning.service';
import { DatabaseService } from '../database/database.service';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectRow, ProjectsRepository } from './projects.repository';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';

export function toPublicProject(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    ownerId: p.owner_id,
    status: p.status,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly provisioning: ProvisioningService,
    private readonly db: DatabaseService,
  ) {}

  async create(userId: string, dto: CreateProjectDto) {
    const id = randomUUID();
    const slug = `${slugify(dto.name)}-${randomBytes(3).toString('hex')}`;
    await this.repo.createWithDefaults({
      id,
      name: dto.name,
      slug,
      ownerId: userId,
    });
    const dbName = await this.provisioning.createProjectDatabase(id);
    await this.db.query('UPDATE projects SET database_name = ? WHERE id = ?', [dbName, id]);
    return this.get(userId, id);
  }

  async list(userId: string, query: PaginationQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.repo.listForMember(userId, query.limit, offset),
      this.repo.countForMember(userId),
    ]);
    return { items: rows.map(toPublicProject), total };
  }

  async get(userId: string, projectId: string) {
    const project = await this.repo.findForMember(projectId, userId);
    if (!project) throw new NotFoundException('Project not found');
    return toPublicProject(project);
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto) {
    const project = await this.requireOwner(userId, projectId);
    if (dto.name !== undefined)
      await this.repo.updateName(project.id, dto.name);
    return this.get(userId, projectId);
  }

  async remove(userId: string, projectId: string) {
    const project = await this.requireOwner(userId, projectId);
    await this.repo.softDelete(project.id);
  }

  private async requireOwner(userId: string, projectId: string) {
    const project = await this.repo.findForMember(projectId, userId);
    if (!project) throw new NotFoundException('Project not found');
    if (project.owner_id !== userId) {
      throw new ForbiddenException('Only the project owner can do this');
    }
    return project;
  }
}
