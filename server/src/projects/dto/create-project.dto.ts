import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  description!: string;

  @IsString()
  @IsIn(['active', 'paused', 'archived'])
  status!: 'active' | 'paused' | 'archived';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
