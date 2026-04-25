import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class UndetectableConnectionSettingsDto {
  @IsString()
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;
}
