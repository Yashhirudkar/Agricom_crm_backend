import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SysModule } from '../models/SysModule';
import { SubModule } from '../models/SubModule';

@Injectable()
export class SystemService {
  constructor(
    @InjectModel(SysModule)
    private moduleModel: typeof SysModule,
    @InjectModel(SubModule)
    private subModuleModel: typeof SubModule,
  ) {}

  async getSidebarModules(): Promise<SysModule[]> {
    return this.moduleModel.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], [{ model: SubModule, as: 'subModules' }, 'sortOrder', 'ASC']],
      include: [
        {
          model: SubModule,
          as: 'subModules',
          where: { isActive: true },
          required: false,
        },
      ],
    });
  }
}
