import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';

/**
 * Authentication Controller
 *
 * PHASE 1 PRODUCTION IMPROVEMENTS:
 * - Rate limiting applied to prevent brute-force attacks
 * - Login: 5 attempts per 15 minutes
 * - Register: 3 attempts per hour (prevent spam)
 * - Password reset: 3 attempts per hour (prevent email bombing)
 */
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  // Register: 3 attempts per hour per IP
  // Prevents fake account spam and bot registration
  @Post('register')
  @RateLimit(3, 60 * 60 * 1000) // 3 per hour
  @UseGuards(RateLimitGuard)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // Login: 5 attempts per 15 minutes per IP
  // Critical: Prevents password brute-force attacks
  @Post('login')
  @RateLimit(5, 15 * 60 * 1000) // 5 per 15 minutes
  @UseGuards(RateLimitGuard)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // Forgot password: 3 attempts per hour
  // Prevents email bombing and abuse
  @Post('forgot-password')
  @RateLimit(3, 60 * 60 * 1000) // 3 per hour
  @UseGuards(RateLimitGuard)
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  // Reset password: 5 attempts per hour
  // More lenient than forgot-password (user has valid token)
  @Post('reset-password')
  @RateLimit(5, 60 * 60 * 1000) // 5 per hour
  @UseGuards(RateLimitGuard)
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.resetPassword(token, password);
  }

  // Google OAuth: No rate limit needed
  // Google handles its own rate limiting and security
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: any) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.googleLogin(req.user);
    const frontendUrl =
      this.configService.get('FRONTEND_PUBLIC_URL') || 'http://localhost:8080';

    const token = result.access_token;
    const userStr = JSON.stringify(result.user);

    // After Google OAuth, always land on home unless a specific redirect was
    // passed through the state param. Default to '/' (home page).
    const redirectTo = (req.query?.state as string) || '/';

    return res.redirect(
      `${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userStr)}&redirect=${encodeURIComponent(redirectTo)}`,
    );
  }
}
