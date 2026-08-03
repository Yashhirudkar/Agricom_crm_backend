import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  attendanceRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  leaveNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  holidayNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  desktopNotificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  updatedAt?: Date; // For optimistic locking

  @IsOptional()
  birthdayMetadata?: any;
}
