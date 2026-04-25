import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'paused', 'archived'])
  status?: 'active' | 'paused' | 'archived';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
