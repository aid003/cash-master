import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME } from './auth.constants';
import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('bootstrap-status')
  bootstrapStatus() {
    return this.authService.getBootstrapStatus();
  }

  @Post('bootstrap')
  async bootstrap(
    @Body() dto: BootstrapDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.bootstrap(dto);
    const token = this.authService.signToken(user);

    this.setAuthCookie(response, token);

    return { user };
  }

  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.validateLogin(dto);
    const token = this.authService.signToken(user);

    this.setAuthCookie(response, token);

    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException();
    }

    const hydrated = await this.authService.getUserById(user.id);
    if (!hydrated) {
      throw new UnauthorizedException();
    }

    return { user: hydrated };
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });

    return { success: true };
  }

  private setAuthCookie(response: Response, token: string): void {
    response.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }
}
