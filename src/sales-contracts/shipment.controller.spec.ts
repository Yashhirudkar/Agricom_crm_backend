import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { memoryStorage } from 'multer';
import request from 'supertest';
import { ShipmentController } from './shipment.controller';
import { ShipmentService } from './shipment.service';
import { AttachmentsService } from '../attachments/services/attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { ANY_PERMISSIONS_KEY } from '../rbac/decorators/require-any-permission.decorator';

jest.mock('../attachments/config/multer.config', () => ({
  getAttachmentMulterConfig: () => ({
    storage: memoryStorage(),
  }),
}));

describe('ShipmentController', () => {
  let app: INestApplication;
  let mockShipmentService: Record<string, jest.Mock>;
  let mockAttachmentsService: Record<string, jest.Mock>;
  const mockUser = {
    id: 1,
    userId: 1,
    companyId: 2,
    type: 'super_admin',
  };
  const mockPermissions = new Set(['shipment_stuffing_execution:edit_completed']);

  beforeEach(async () => {
    mockShipmentService = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getStats: jest.fn().mockResolvedValue({ total: 0 }),
      exportExcel: jest.fn().mockResolvedValue(Buffer.from('excel')),
      findOne: jest.fn().mockResolvedValue({ id: 74 }),
      update: jest.fn().mockResolvedValue({ id: 74 }),
      updateCargoReadiness: jest.fn().mockResolvedValue({ id: 74 }),
      updateManualReadiness: jest.fn().mockResolvedValue({ id: 74 }),
      getStuffingExecutionData: jest.fn().mockResolvedValue({ shipmentId: 74 }),
      saveStuffingExecution: jest.fn().mockResolvedValue({ success: true }),
      assertCanModifyStuffing: jest.fn().mockResolvedValue({ allowed: true }),
    };

    mockAttachmentsService = {
      createAttachment: jest.fn().mockResolvedValue({
        id: 99,
        originalName: 'bl.pdf',
        storedName: 'stored-bl.pdf',
        fileSize: 1234,
        mimeType: 'application/pdf',
        storagePath: 'stored-bl.pdf',
      }),
    };

    const allowGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        req.user = mockUser;
        req.userPermissions = mockPermissions;
        req.activeCompanyId = mockUser.companyId;
        return true;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ShipmentController],
      providers: [
        { provide: ShipmentService, useValue: mockShipmentService },
        { provide: AttachmentsService, useValue: mockAttachmentsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(allowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('routes POST and PATCH stuffing-execution under both sales-contracts/shipments and shipments', async () => {
    const payload = { action: 'complete', actualLoadingWeight: 22 };

    const postSalesRes = await request(app.getHttpServer())
      .post('/api/sales-contracts/shipments/74/stuffing-execution')
      .send(payload)
      .expect(200);
    expect(postSalesRes.body).toEqual({ success: true });

    await request(app.getHttpServer())
      .patch('/api/sales-contracts/shipments/74/stuffing-execution')
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/shipments/74/stuffing-execution')
      .send(payload)
      .expect(200);

    expect(mockShipmentService.saveStuffingExecution).toHaveBeenCalledTimes(3);
    expect(mockShipmentService.saveStuffingExecution).toHaveBeenCalledWith(
      74,
      payload,
      mockUser,
      mockPermissions,
    );
  });

  it('routes GET stuffing-execution and export/excel under sales-contracts/shipments', async () => {
    await request(app.getHttpServer())
      .get('/api/sales-contracts/shipments/74/stuffing-execution')
      .expect(200);
    expect(mockShipmentService.getStuffingExecutionData).toHaveBeenCalledWith(
      74,
      mockUser,
    );

    await request(app.getHttpServer())
      .get('/api/sales-contracts/shipments/74/stuffing-execution?shipmentIds=74,75,76')
      .expect(200);
    expect(mockShipmentService.getStuffingExecutionData).toHaveBeenCalledWith(
      74,
      mockUser,
      '74,75,76',
    );

    const exportRes = await request(app.getHttpServer())
      .get('/api/sales-contracts/shipments/export/excel')
      .expect(200);
    expect(exportRes.headers['content-disposition']).toContain('shipments.xlsx');
    expect(mockShipmentService.exportExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 2,
        userPermissions: mockPermissions,
        userType: 'super_admin',
      }),
    );

    await request(app.getHttpServer())
      .get('/api/sales-contracts/shipments/export')
      .expect(200);
  });

  it('passes companyId, userPermissions, and userType on findAll, stats, and cargo-readiness', async () => {
    await request(app.getHttpServer())
      .get('/api/sales-contracts/shipments')
      .expect(200);
    expect(mockShipmentService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 2,
        userPermissions: mockPermissions,
        userType: 'super_admin',
      }),
    );

    await request(app.getHttpServer())
      .get('/api/sales-contracts/shipments/stats')
      .expect(200);
    expect(mockShipmentService.getStats).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 2 }),
    );

    await request(app.getHttpServer())
      .patch('/api/sales-contracts/shipments/74/cargo-readiness')
      .send({ cargoReadyConfirmed: true, cargoReadyDate: '2026-11-26' })
      .expect(200);
    expect(mockShipmentService.updateCargoReadiness).toHaveBeenCalledWith(
      74,
      { cargoReadyConfirmed: true, cargoReadyDate: '2026-11-26' },
      mockUser,
      mockPermissions,
    );
  });

  it('routes stuffing attachment upload and enforces stuffing modification check', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sales-contracts/shipments/74/stuffing-execution/attachments')
      .attach('file', Buffer.from('%PDF-1.4 mock'), {
        filename: 'bl.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(mockShipmentService.assertCanModifyStuffing).toHaveBeenCalledWith(
      74,
      mockUser,
      mockPermissions,
    );
    expect(mockAttachmentsService.createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'bl.pdf' }),
      1,
      2,
    );
    expect(res.body).toMatchObject({
      id: 99,
      attachmentId: 99,
      originalName: 'bl.pdf',
      downloadUrl: '/attachments/99/download',
    });
  });

  it('keeps expected RBAC metadata on stuffing and cargo readiness handlers', () => {
    const savePerms = Reflect.getMetadata(
      ANY_PERMISSIONS_KEY,
      ShipmentController.prototype.saveStuffingExecution,
    );
    expect(savePerms).toEqual([
      'shipments:update',
      'shipment_stuffing_execution:update',
      'shipment_stuffing_execution:view',
    ]);

    const cargoPerms = Reflect.getMetadata(
      ANY_PERMISSIONS_KEY,
      ShipmentController.prototype.updateCargoReadiness,
    );
    expect(cargoPerms).toEqual([
      'cargo_allocation:create',
      'cargo_allocation:update',
      'cargo_allocation:edit_completed',
    ]);
  });
});
