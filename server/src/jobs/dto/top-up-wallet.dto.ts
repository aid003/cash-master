import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class TopUpWalletDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;
}
