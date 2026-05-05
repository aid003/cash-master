import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class TopUpWalletDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amount!: number;
}
