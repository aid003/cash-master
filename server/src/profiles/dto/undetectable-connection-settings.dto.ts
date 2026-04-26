import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';

export class UndetectableConnectionSettingsDto {
  @IsString()
  @IsIn(['http', 'https'])
  protocol!: 'http' | 'https';

  @IsString()
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;
}
