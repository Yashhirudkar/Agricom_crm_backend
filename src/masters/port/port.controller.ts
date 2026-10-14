import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import * as ExcelJS from 'exceljs';
import { PortService } from './port.service';
import { CreatePortDto } from './dto/create-port.dto';
import { UpdatePortDto } from './dto/update-port.dto';
import { QueryPortDto } from './dto/query-port.dto';
import { AddShippingLineToPortDto } from './dto/port-shipping-line.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller(['masters/ports', 'ports'])
export class PortController {
  constructor(private readonly service: PortService) {}

  @Get()
  async findAll(@Query() query: QueryPortDto) {
    return await this.service.findAll(query);
  }

  @Get('export')
  async exportExcel(@Res() res: Response) {
    const buffer = await this.service.exportExcel();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Ports_Master_Export.xlsx"',
    );
    res.end(buffer);
  }

  @Get('template')
  async getTemplate(@Res() res: Response) {
    const buffer = await this.service.getImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Ports_Import_Template.xlsx"',
    );
    res.end(buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { rows?: any[] },
  ) {
    let rowsToProcess: any[] = [];

    if (file && file.buffer) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as any);
      const sheet = workbook.worksheets[0];
      if (sheet) {
        // Read headers from row 1
        const headerRow = sheet.getRow(1);
        const colMap: Record<number, string> = {};
        headerRow.eachCell((cell, colNumber) => {
          const val = String(cell.value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
          if (val.includes('country')) colMap[colNumber] = 'country';
          else if (val.includes('portname') || val === 'port') colMap[colNumber] = 'port_name';
          else if (val.includes('unlocode')) colMap[colNumber] = 'unlocode';
          else if (val.includes('type')) colMap[colNumber] = 'port_type';
          else if (val.includes('shippingline') || val.includes('line')) colMap[colNumber] = 'shipping_line';
        });

        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          const rowData: any = {};
          row.eachCell((cell, colNumber) => {
            const key = colMap[colNumber];
            if (key) {
              const cellVal = cell.value;
              rowData[key] = typeof cellVal === 'object' && cellVal !== null ? (cellVal as any).text || '' : String(cellVal || '');
            }
          });
          if (rowData.country && rowData.port_name) {
            rowsToProcess.push(rowData);
          }
        });
      }
    } else if (Array.isArray(body?.rows)) {
      rowsToProcess = body.rows;
    }

    return await this.service.importExcelRows(rowsToProcess);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePortDto, @Req() req: any) {
    return await this.service.create(dto, req.user);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePortDto,
    @Req() req: any,
  ) {
    return await this.service.update(id, dto, req.user);
  }

  @Patch(':id/toggle')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return await this.service.toggleStatus(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.service.remove(id);
  }

  @Post(':id/shipping-lines')
  @HttpCode(HttpStatus.CREATED)
  async addShippingLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddShippingLineToPortDto,
  ) {
    return await this.service.addShippingLine(id, dto);
  }

  @Delete(':id/shipping-lines/:lineId')
  async removeShippingLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
  ) {
    return await this.service.removeShippingLine(id, lineId);
  }
}
