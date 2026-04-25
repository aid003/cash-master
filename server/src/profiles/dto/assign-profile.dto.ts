import { IsString, MinLength } from 'class-validator';

export class AssignProfileDto {
  @IsString()
  @MinLength(1)
  projectId!: string;
}
