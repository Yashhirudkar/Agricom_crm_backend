import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { Branch } from '../../hrms/models/branch.model';

@Injectable()
export class AttendanceHelperService {
  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
  ) {}

  // Helper: Get local date & time details based on timezone
  public getLocalTimeDetails(
    timezone = 'Asia/Kolkata',
    inputDate = new Date(),
  ): { todayDateStr: string; minutesOfDay: number; jsDay: number } {
    const tz = timezone || 'Asia/Kolkata';
    const todayDateStr = inputDate.toLocaleDateString('en-CA', {
      timeZone: tz,
    });

    // Format to HH:MM:SS (24-hour)
    const localTimeStr = inputDate.toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: tz,
    });
    const [hour, minute] = localTimeStr.split(':').map(Number);
    const minutesOfDay = hour * 60 + minute;

    // Get JS day of week (0 = Sunday, 1 = Monday, etc.) in target timezone
    const dayOfWeekStr = inputDate.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: tz,
    });
    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const jsDay = weekdayNames.indexOf(dayOfWeekStr);

    return { todayDateStr, minutesOfDay, jsDay };
  }

  // Helper: Calculate distance between coordinates (Haversine formula)
  public calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }

  // Helper: Verify and enforce geo-fencing configuration
  public validateGeoLocation(employee: Employee, lat?: number, lng?: number) {
    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new BadRequestException('Invalid geolocation coordinates.');
      }
    }

    const branch = employee.branch;
    if (
      branch &&
      branch.latitude !== null &&
      branch.longitude !== null &&
      branch.geoFenceRadius !== null
    ) {
      if (employee.workMode === 'OFFICE') {
        if (lat === undefined || lng === undefined) {
          throw new BadRequestException(
            'Location coordinates are required for office work mode check-in',
          );
        }

        const distance = this.calculateDistance(
          lat,
          lng,
          branch.latitude,
          branch.longitude,
        );
        if (distance > branch.geoFenceRadius) {
          throw new BadRequestException(
            `Geo-fence verification failed: You are outside the branch boundary by ${Math.round(distance - branch.geoFenceRadius)} meters.`,
          );
        }
      }
    }
  }

  // Helper: Calculate late minutes
  public calculateLateMinutes(
    minutesOfDay: number,
    shiftStartTime: string,
    gracePeriod: number,
  ): number {
    const [shiftHour, shiftMin] = shiftStartTime.split(':').map(Number);
    const shiftMinutes = shiftHour * 60 + shiftMin;

    if (minutesOfDay > shiftMinutes + gracePeriod) {
      return minutesOfDay - shiftMinutes;
    }
    return 0;
  }

  // Helper: Verify if employee is linked and active
  public async getActiveEmployee(
    employeeId: number,
    companyId: number,
  ): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: { id: employeeId, companyId },
      include: [Branch],
    });

    if (!employee) {
      throw new NotFoundException(
        'Employee profile not found in this company workspace',
      );
    }

    const inactiveStatuses = [
      EmployeeStatus.DRAFT,
      EmployeeStatus.RESIGNED,
      EmployeeStatus.TERMINATED,
    ];
    if (inactiveStatuses.includes(employee.status)) {
      throw new ForbiddenException(
        `Employee account is inactive (Status: ${employee.status})`,
      );
    }

    return employee;
  }
}
