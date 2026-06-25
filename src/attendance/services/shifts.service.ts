import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Shift } from '../models/shift.model';
import { CreateShiftDto, UpdateShiftDto } from '../dto/shift.dto';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectModel(Shift)
    private readonly shiftModel: typeof Shift,
  ) {}

  async createShift(companyId: number, dto: CreateShiftDto): Promise<Shift> {
    const existing = await this.shiftModel.findOne({
      where: { companyId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Shift with name "${dto.name}" already exists for this company`,
      );
    }

    return this.shiftModel.create({
      companyId,
      name: dto.name,
      startTime: dto.startTime,
      endTime: dto.endTime,
      breakMinutes: dto.breakMinutes || 0,
      gracePeriodMinutes: dto.gracePeriodMinutes || 0,
      isNightShift: dto.isNightShift || false,
      weeklyOffDays: dto.weeklyOffDays || [],
    });
  }

  async getShifts(companyId: number): Promise<Shift[]> {
    return this.shiftModel.findAll({
      where: { companyId },
      order: [['createdAt', 'DESC']],
    });
  }

  async getShiftById(id: number, companyId: number): Promise<Shift> {
    const shift = await this.shiftModel.findOne({
      where: { id, companyId },
    });
    if (!shift) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }
    return shift;
  }

  async updateShift(
    id: number,
    companyId: number,
    dto: UpdateShiftDto,
  ): Promise<Shift> {
    const shift = await this.getShiftById(id, companyId);

    if (dto.name && dto.name !== shift.name) {
      const conflict = await this.shiftModel.findOne({
        where: { companyId, name: dto.name },
      });
      if (conflict) {
        throw new ConflictException(
          `Shift with name "${dto.name}" already exists for this company`,
        );
      }
    }

    await shift.update({
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.startTime !== undefined && { startTime: dto.startTime }),
      ...(dto.endTime !== undefined && { endTime: dto.endTime }),
      ...(dto.breakMinutes !== undefined && { breakMinutes: dto.breakMinutes }),
      ...(dto.gracePeriodMinutes !== undefined && {
        gracePeriodMinutes: dto.gracePeriodMinutes,
      }),
      ...(dto.isNightShift !== undefined && { isNightShift: dto.isNightShift }),
      ...(dto.weeklyOffDays !== undefined && {
        weeklyOffDays: dto.weeklyOffDays,
      }),
    });

    return shift.reload();
  }

  async deleteShift(
    id: number,
    companyId: number,
  ): Promise<{ message: string }> {
    const shift = await this.getShiftById(id, companyId);
    await shift.destroy();
    return { message: `Shift "${shift.name}" deleted successfully` };
  }
}
