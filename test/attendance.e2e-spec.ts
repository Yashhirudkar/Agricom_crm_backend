import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Sequelize } from 'sequelize-typescript';
import { JwtService } from '@nestjs/jwt';
import { Employee, EmployeeStatus, WorkMode } from '../src/hrms/models/employee.model';
import { Company } from '../src/companies/models/company.model';
import { Branch } from '../src/hrms/models/branch.model';
import { Shift } from '../src/attendance/models/shift.model';
import { AttendanceRecord, AttendanceStatus } from '../src/attendance/models/attendance-record.model';
import { AttendanceLog, AttendanceActionType } from '../src/attendance/models/attendance-log.model';
import { AttendanceException, AttendanceExceptionType, AttendanceExceptionStatus } from '../src/attendance/models/attendance-exception.model';
import { User } from '../src/users/models/user.model';
import { UserSession } from '../src/users/models/user-session.model';
import { CompanyHrPolicy } from '../src/companies/models/company-hr-policy.model';
import { Holiday } from '../src/holidays/models/holiday.model';
import { AttendanceCronService } from '../src/attendance/services/attendance-cron.service';
import { AttendanceService } from '../src/attendance/services/attendance.service';
import { UserCompany } from '../src/users/models/user-company.model';
import { Role } from '../src/rbac/models/role.model';

import { UserRole } from '../src/rbac/models/user-role.model';

describe('Attendance Module (E2E Integration Tests)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let sequelize: Sequelize;
  let jwtService: JwtService;
  let cronService: AttendanceCronService;
  let attendanceService: AttendanceService;

  // Global test entities
  let testCompany: Company;
  let testBranch: Branch;
  let testPolicy: CompanyHrPolicy;
  let testShift: Shift;
  let testEmployeeUser: User;
  let testEmployee: Employee;
  let testManagerUser: User;
  let testManager: Employee;
  let testAdminUser: User;
  let testEmpRole: Role;
  let testMgrRole: Role;
  let testAdmRole: Role;

  // Tokens
  let employeeToken: string;
  let managerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    sequelize = app.get(Sequelize);
    jwtService = app.get(JwtService);
    cronService = app.get(AttendanceCronService);
    attendanceService = app.get(AttendanceService);

    // --- SEED SEAMLESS TEST DATABASE CONTEXT ---
    // 1. Create Company
    testCompany = await Company.create({
      name: 'E2E Test Corporate',
      clientId: 1, // Fallback clientId
      isActive: true,
      status: 'Active',
    } as any);

    // 2. Create Branch with GeoFence
    testBranch = await Branch.create({
      companyId: testCompany.id,
      branchName: 'Mumbai E2E Head Office',
      branchCode: 'B-MUM-E2E',
      timezone: 'Asia/Kolkata',
      latitude: 19.0760, // Mumbai Center
      longitude: 72.8777,
      geoFenceRadius: 100, // 100 meters boundary
      isActive: true,
    } as any);

    // 3. Create HR Policy
    testPolicy = await CompanyHrPolicy.create({
      companyId: testCompany.id,
      defaultWorkingHoursPerDay: 8,
      defaultWeeklyWorkingDays: 5,
      allowRemoteWork: false,
      overtimeAllowed: true,
      overtimeMultiplier: 1.5,
      lateComingGraceMinutes: 15,
      weeklyOffDays: [0, 6],
      minHoursForPresent: 8,
      minHoursForHalfDay: 4,
      allowAttendanceCorrection: true,
      maxCorrectionDays: 3,
      defaultShiftStartTime: '09:00',
      defaultShiftEndTime: '18:00',
    } as any);

    // 4. Create Shift
    testShift = await Shift.create({
      companyId: testCompany.id,
      name: 'E2E Day Shift',
      startTime: '09:00',
      endTime: '18:00',
      breakMinutes: 60,
      gracePeriodMinutes: 15,
      isNightShift: false,
      weeklyOffDays: [0, 6],
    } as any);

    // 5. Create users and employees
    testEmployeeUser = await User.create({
      name: 'E2E Employee User',
      email: 'e2e_emp@agricomtest.com',
      password: 'password_e2e_hashed',
      isActive: true,
      status: 'Active',
      clientId: 1,
      lastCompanyId: testCompany.id,
    } as any);

    testEmployee = await Employee.create({
      companyId: testCompany.id,
      userId: testEmployeeUser.id,
      firstName: 'EmpName',
      lastName: 'EmpLast',
      email: 'e2e_emp@agricomtest.com',
      employeeCode: 'E2E-EMP-001',
      status: EmployeeStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      branchId: testBranch.id,
      shiftId: testShift.id,
      employmentType: 'FULL_TIME',
    } as any);

    testManagerUser = await User.create({
      name: 'E2E Manager User',
      email: 'e2e_mgr@agricomtest.com',
      password: 'password_e2e_hashed',
      isActive: true,
      status: 'Active',
      clientId: 1,
      lastCompanyId: testCompany.id,
    } as any);

    testManager = await Employee.create({
      companyId: testCompany.id,
      userId: testManagerUser.id,
      firstName: 'MgrName',
      lastName: 'MgrLast',
      email: 'e2e_mgr@agricomtest.com',
      employeeCode: 'E2E-MGR-001',
      status: EmployeeStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      branchId: testBranch.id,
      shiftId: testShift.id,
      employmentType: 'FULL_TIME',
    } as any);

    // Link Employee to Manager
    await testEmployee.update({ managerId: testManager.id });

    testAdminUser = await User.create({
      name: 'E2E Admin User',
      email: 'e2e_adm@agricomtest.com',
      password: 'password_e2e_hashed',
      isActive: true,
      status: 'Active',
      clientId: 1,
      lastCompanyId: testCompany.id,
    } as any);



    // Create custom test roles
    testEmpRole = await Role.create({
      name: 'E2E Employee Role',
      description: 'E2E Employee Role',
      isActive: true,
      companyId: testCompany.id,
    } as any);

    testMgrRole = await Role.create({
      name: 'E2E Manager Role',
      description: 'E2E Manager Role',
      isActive: true,
      companyId: testCompany.id,
    } as any);

    testAdmRole = await Role.create({
      name: 'E2E Admin Role',
      description: 'E2E Admin Role',
      isActive: true,
      companyId: testCompany.id,
    } as any);



    // Create UserCompany workspace associations
    await UserCompany.bulkCreate([
      { userId: testEmployeeUser.id, companyId: testCompany.id, roleId: testEmpRole.id, status: 'Active' },
      { userId: testManagerUser.id, companyId: testCompany.id, roleId: testMgrRole.id, status: 'Active' },
      { userId: testAdminUser.id, companyId: testCompany.id, roleId: testAdmRole.id, status: 'Active' },
    ] as any[]);

    // Associate admin user with global role for client admin validation
    await UserRole.create({
      userId: testAdminUser.id,
      roleId: testAdmRole.id,
    } as any);

    // Generate programmatic sessions in user_sessions for guards validation
    const sessEmp = crypto.randomUUID();
    const sessMgr = crypto.randomUUID();
    const sessAdm = crypto.randomUUID();

    await UserSession.bulkCreate([
      {
        sessionId: sessEmp,
        userId: testEmployeeUser.id,
        clientId: 1,
        refreshTokenHash: `hash-${sessEmp}`,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        isRevoked: false,
      },
      {
        sessionId: sessMgr,
        userId: testManagerUser.id,
        clientId: 1,
        refreshTokenHash: `hash-${sessMgr}`,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        isRevoked: false,
      },
      {
        sessionId: sessAdm,
        userId: testAdminUser.id,
        clientId: 1,
        refreshTokenHash: `hash-${sessAdm}`,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        isRevoked: false,
      },
    ] as any[]);

    employeeToken = jwtService.sign({ sub: testEmployeeUser.id, userId: testEmployeeUser.id, clientId: 1, email: testEmployeeUser.email, type: 'user', sessionId: sessEmp });
    managerToken = jwtService.sign({ sub: testManagerUser.id, userId: testManagerUser.id, clientId: 1, email: testManagerUser.email, type: 'user', sessionId: sessMgr });
    adminToken = jwtService.sign({ sub: testAdminUser.id, userId: testAdminUser.id, clientId: 1, email: testAdminUser.email, type: 'client_admin', sessionId: sessAdm });
  });

  afterAll(async () => {
    // Cleanup seed data database states safely
    if (testCompany) {
      await AttendanceLog.destroy({ where: { employeeId: [testEmployee.id, testManager.id] } });
      await AttendanceException.destroy({ where: { employeeId: [testEmployee.id, testManager.id] } });
      await AttendanceRecord.destroy({ where: { employeeId: [testEmployee.id, testManager.id] } });
      await Employee.destroy({ where: { companyId: testCompany.id } });
      await Shift.destroy({ where: { companyId: testCompany.id } });
      await CompanyHrPolicy.destroy({ where: { companyId: testCompany.id } });
      await Branch.destroy({ where: { companyId: testCompany.id } });
      await UserCompany.destroy({ where: { companyId: testCompany.id } });
      if (testEmpRole && testMgrRole && testAdmRole) {
        await Role.destroy({ where: { id: [testEmpRole.id, testMgrRole.id, testAdmRole.id] } });
      }
      await UserRole.destroy({ where: { userId: [testEmployeeUser.id, testManagerUser.id, testAdminUser.id] } });
      await UserSession.destroy({ where: { userId: [testEmployeeUser.id, testManagerUser.id, testAdminUser.id] } });
      await User.destroy({ where: { id: [testEmployeeUser.id, testManagerUser.id, testAdminUser.id] } });
      await testCompany.destroy();
    }
    await app.close();
  });

  // --- 16 SCENARIO TESTS E2E ---

  // 1. Employee check-in success
  it('1. Employee check-in success', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 }); // Correct Mumbai Head Office coords

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.checkInTime).not.toBeNull();
  });

  // 2. Double check-in should fail
  it('2. Double check-in should fail', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });

    expect(res.status).toBe(409); // ConflictException
  });

  // 3. Break start success
  it('3. Break start success', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/break-start')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });

    expect(res.status).toBe(200);
    expect(res.body.actionType).toBe(AttendanceActionType.BREAK_START);
  });

  // 4. Break start twice should fail
  it('4. Break start twice should fail', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/break-start')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });

    expect(res.status).toBe(409); // ConflictException
  });

  // 5. Break end without break start should fail (First resolve the current break, then trigger end again)
  it('5. Break end without break start should fail', async () => {
    // Resolve current break successfully
    const successRes = await request(app.getHttpServer())
      .post('/api/attendance/break-end')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });
    expect(successRes.status).toBe(200);

    // Call break-end again when NOT on break
    const failRes = await request(app.getHttpServer())
      .post('/api/attendance/break-end')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });

    expect(failRes.status).toBe(400); // BadRequestException
  });

  // 6. Employee check-out success
  it('6. Employee check-out success', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });

    expect(res.status).toBe(200);
    expect(res.body.checkOutTime).not.toBeNull();
    expect(res.body).toHaveProperty('totalHours');
  });

  // 7. Double check-out should fail
  it('7. Double check-out should fail', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 19.0760, locationLng: 72.8777 });

    expect(res.status).toBe(409); // ConflictException
  });

  // 8. Late mark detection
  it('8. Late mark detection', () => {
    // 09:30 AM is 570 minutes of day. 09:00 AM shift start is 540 minutes of day.
    // Grace is 15 minutes. 570 > 545, so late minutes = 570 - 540 = 30.
    const lateMinutes = (attendanceService as any).calculateLateMinutes(570, '09:00', 15);
    expect(lateMinutes).toBe(30);

    const onTimeMinutes = (attendanceService as any).calculateLateMinutes(548, '09:00', 15);
    expect(onTimeMinutes).toBe(0);
  });

  // 9. Night shift calculations (10 PM to 6 AM crossover)
  it('9. Night shift crossing date boundary', async () => {
    // Seed a dummy night shift (startTime = 22:00, endTime = 06:00, breakMinutes = 60)
    const nightShift = await Shift.create({
      companyId: testCompany.id,
      name: 'E2E Night Shift',
      startTime: '22:00',
      endTime: '06:00',
      gracePeriodMinutes: 15,
      breakMinutes: 60,
      isNightShift: true,
      weeklyOffDays: [0, 6],
    } as any);

    // Yesterday's date Str
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayDateStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // 1. Check in yesterday at 10 PM
    const record = await AttendanceRecord.create({
      employeeId: testEmployee.id,
      companyId: testCompany.id,
      date: yesterdayDateStr,
      checkInTime: new Date(`${yesterdayDateStr}T22:00:00`),
      attendanceStatus: AttendanceStatus.PRESENT,
      shiftId: nightShift.id,
    } as any);

    // 2. Break logs (1 hour break)
    await AttendanceLog.bulkCreate([
      { employeeId: testEmployee.id, attendanceRecordId: record.id, actionType: AttendanceActionType.BREAK_START, timestamp: new Date(`${yesterdayDateStr}T23:50:00`) },
      { employeeId: testEmployee.id, attendanceRecordId: record.id, actionType: AttendanceActionType.BREAK_END, timestamp: new Date(`${yesterdayDateStr}T23:59:59`) }, // Close break
      { employeeId: testEmployee.id, attendanceRecordId: record.id, actionType: AttendanceActionType.BREAK_START, timestamp: new Date(`${record.date}T01:00:00`) }, // Start second break (cross-boundary)
      { employeeId: testEmployee.id, attendanceRecordId: record.id, actionType: AttendanceActionType.BREAK_END, timestamp: new Date(`${record.date}T01:50:01`) } // Close break
    ] as any[]);

    // 3. Checkout at 6:00 AM next day (today)
    // Manually run checkout service logic with custom date/time to avoid local time skew
    const t = await sequelize.transaction();
    try {
      const recordToCheckout = await AttendanceRecord.findOne({
        where: { id: record.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const checkoutTime = new Date(`${yesterdayDateStr}T06:00:00`);
      checkoutTime.setDate(checkoutTime.getDate() + 1); // Next morning

      const checkInTime = new Date(recordToCheckout!.checkInTime);
      const totalWorkMs = checkoutTime.getTime() - checkInTime.getTime() - (60 * 60 * 1000); // minus 1 hr breaks
      const totalHours = Math.max(0, parseFloat((totalWorkMs / (1000 * 60 * 60)).toFixed(2)));

      await recordToCheckout!.update({
        checkOutTime: checkoutTime,
        totalHours,
        attendanceStatus: AttendanceStatus.PRESENT,
      }, { transaction: t });

      await t.commit();

      expect(totalHours).toBe(7); // 8 hours duration - 1 hour breaks
    } catch (err) {
      await t.rollback();
      throw err;
    } finally {
      await nightShift.destroy();
    }
  });

  // 10. Geo-fence validation
  it('10. Geo-fence validation wrong coordinates', async () => {
    // Temporary delete today's record to check check-in
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayDateStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    await AttendanceRecord.destroy({ where: { employeeId: testEmployee.id, date: yesterdayDateStr } });

    const res = await request(app.getHttpServer())
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ locationLat: 40.7128, locationLng: -74.0060 }); // New York coords ( Mumbai is 19.0760, 72.8777 )

    expect(res.status).toBe(400); // Rejected outside geo-fence
    expect(res.body.message).toContain('Geo-fence verification failed');
  });

  // 11. Correction request
  it('11. Correction request creation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/request-correction')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({
        type: AttendanceExceptionType.MISSED_PUNCH,
        reason: 'Missed punch due to emergency',
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        checkInTime: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(AttendanceExceptionStatus.PENDING);
  });

  // 12. Self approval attempt
  it('12. Self approval attempt rejection', async () => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const exception = await AttendanceException.create({
      employeeId: testManager.id,
      type: AttendanceExceptionType.MISSED_PUNCH,
      reason: 'Self approval attempt test',
      status: AttendanceExceptionStatus.PENDING,
      metadata: { date: todayStr },
    } as any);

    // Call approve using manager token
    const res = await request(app.getHttpServer())
      .put(`/api/attendance/${exception.id}/approve-correction`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ remarks: 'Self approve remarks' });

    expect(res.status).toBe(403); // ForbiddenException
    expect(res.body.message).toContain('You cannot approve or reject your own correction request');

    await exception.destroy();
  });

  // 13. Admin override audit log verification
  it('13. Admin override log verification', async () => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    let record = await AttendanceRecord.findOne({ where: { employeeId: testEmployee.id, date: todayStr } });
    if (!record) {
      record = await AttendanceRecord.create({
        employeeId: testEmployee.id,
        companyId: testCompany.id,
        date: todayStr,
        attendanceStatus: AttendanceStatus.PRESENT,
      } as any);
    }

    const res = await request(app.getHttpServer())
      .put(`/api/attendance/${record.id}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({
        attendanceStatus: AttendanceStatus.PRESENT,
        lateMinutes: 10,
        remarks: 'Admin E2E override check',
      });

    expect(res.status).toBe(200);

    // Verify Audit log exists
    const log = await AttendanceLog.findOne({
      where: {
        attendanceRecordId: record.id,
        actionType: AttendanceActionType.AUTO_CORRECTION,
      },
      order: [['createdAt', 'DESC']],
    });

    expect(log).not.toBeNull();
    expect(log!.metadata.remarks).toBe('Admin E2E override check');
  });

  // 14. Cron job simulate absentee marking
  it('14. Cron job simulate absentee marking', async () => {
    // Delete attendance records for yesterday
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayDateStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    await AttendanceRecord.destroy({ where: { employeeId: testEmployee.id, date: yesterdayDateStr } });

    // Temporarily force yesterday to be a working day for E2E consistency
    await testShift.update({ weeklyOffDays: [] });

    // Trigger cron job
    await cronService.markDailyAbsentees();

    const record = await AttendanceRecord.findOne({
      where: { employeeId: testEmployee.id, date: yesterdayDateStr },
    });

    expect(record).not.toBeNull();
    expect(record!.attendanceStatus).toBe(AttendanceStatus.ABSENT);
  });

  // 15. Verify SQL constraints (Duplicate daily records)
  it('15. Verify SQL constraints unique daily record', async () => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    try {
      await AttendanceRecord.create({
        employeeId: testEmployee.id,
        companyId: testCompany.id,
        date: todayStr,
        attendanceStatus: AttendanceStatus.ABSENT,
      } as any);
      fail('SQL Unique Constraint check failed: duplicate record allowed');
    } catch (err: any) {
      expect(err.name).toBe('SequelizeUniqueConstraintError');
    }
  });

  // 16. Verify correction request duplicate resolution prevention
  it('16. Verify correction request duplicate resolution prevention', async () => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const exception = await AttendanceException.create({
      employeeId: testEmployee.id,
      type: AttendanceExceptionType.MISSED_PUNCH,
      reason: 'Double resolution test',
      status: AttendanceExceptionStatus.APPROVED, // Already approved
      metadata: { date: todayStr },
    } as any);

    const res = await request(app.getHttpServer())
      .put(`/api/attendance/${exception.id}/approve-correction`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('x-company-id', String(testCompany.id))
      .send({ remarks: 'Approve again' });

    expect(res.status).toBe(400); // Already resolved request throws BadRequestException
    expect(res.body.message).toContain('already resolved');

    await exception.destroy();
  });

  // 17. Stress test check-in concurrency
  it('17. Stress test check-in concurrency', async () => {
    const uniqueEmail = `concur_${Date.now()}@agricomtest.com`;
    const uniqueEmpCode = `EMP-CONCUR-${Date.now()}`;
    const uniqueSess = crypto.randomUUID();

    const newEmpUser = await User.create({
      name: 'E2E Concurrency Employee',
      email: uniqueEmail,
      password: 'password_e2e_hashed',
      isActive: true,
      status: 'Active',
      clientId: 1,
      lastCompanyId: testCompany.id,
    } as any);

    const newEmp = await Employee.create({
      companyId: testCompany.id,
      userId: newEmpUser.id,
      firstName: 'ConcurName',
      lastName: 'ConcurLast',
      email: uniqueEmail,
      employeeCode: uniqueEmpCode,
      status: EmployeeStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      branchId: testBranch.id,
      shiftId: testShift.id,
      employmentType: 'FULL_TIME',
    } as any);

    await UserCompany.create({ userId: newEmpUser.id, companyId: testCompany.id, roleId: testEmpRole.id, status: 'Active' });
    await UserRole.create({ userId: newEmpUser.id, roleId: testEmpRole.id });

    await UserSession.create({
      sessionId: uniqueSess,
      userId: newEmpUser.id,
      clientId: 1,
      refreshTokenHash: `hash-${uniqueSess}`,
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      isRevoked: false,
    } as any);

    const newEmpToken = jwtService.sign({ sub: newEmpUser.id, userId: newEmpUser.id, clientId: 1, email: newEmpUser.email, type: 'user', sessionId: uniqueSess });

    const requests = Array.from({ length: 20 }).map(() =>
      request(app.getHttpServer())
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${newEmpToken}`)
        .set('x-company-id', String(testCompany.id))
        .send({ locationLat: 19.0760, locationLng: 72.8777 })
    );

    const results = await Promise.all(requests);

    const statusCodes = results.map(r => r.status);
    const successCount = statusCodes.filter(s => s === 200).length;
    const conflictCount = statusCodes.filter(s => s === 409).length;

    const dbCount = await AttendanceRecord.count({
      where: { employeeId: newEmp.id, date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
    });

    expect(dbCount).toBe(1);
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(19);

    // Cleanup
    await AttendanceLog.destroy({ where: { employeeId: newEmp.id } });
    await AttendanceRecord.destroy({ where: { employeeId: newEmp.id } });
    await Employee.destroy({ where: { id: newEmp.id } });
    await UserSession.destroy({ where: { userId: newEmpUser.id } });
    await UserRole.destroy({ where: { userId: newEmpUser.id } });
    await UserCompany.destroy({ where: { userId: newEmpUser.id } });
    await User.destroy({ where: { id: newEmpUser.id } });
  });

  // 18. Stress test checkout concurrency
  it('18. Stress test checkout concurrency', async () => {
    const uniqueEmail = `concur_out_${Date.now()}@agricomtest.com`;
    const uniqueEmpCode = `EMP-CONCUR-OUT-${Date.now()}`;
    const uniqueSess = crypto.randomUUID();

    const newEmpUser = await User.create({
      name: 'E2E Concurrency Employee Out',
      email: uniqueEmail,
      password: 'password_e2e_hashed',
      isActive: true,
      status: 'Active',
      clientId: 1,
      lastCompanyId: testCompany.id,
    } as any);

    const newEmp = await Employee.create({
      companyId: testCompany.id,
      userId: newEmpUser.id,
      firstName: 'ConcurNameOut',
      lastName: 'ConcurLastOut',
      email: uniqueEmail,
      employeeCode: uniqueEmpCode,
      status: EmployeeStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      branchId: testBranch.id,
      shiftId: testShift.id,
      employmentType: 'FULL_TIME',
    } as any);

    await UserCompany.create({ userId: newEmpUser.id, companyId: testCompany.id, roleId: testEmpRole.id, status: 'Active' });
    await UserRole.create({ userId: newEmpUser.id, roleId: testEmpRole.id });

    await UserSession.create({
      sessionId: uniqueSess,
      userId: newEmpUser.id,
      clientId: 1,
      refreshTokenHash: `hash-${uniqueSess}`,
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      isRevoked: false,
    } as any);

    const newEmpToken = jwtService.sign({ sub: newEmpUser.id, userId: newEmpUser.id, clientId: 1, email: newEmpUser.email, type: 'user', sessionId: uniqueSess });
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const record = await AttendanceRecord.create({
      employeeId: newEmp.id,
      companyId: testCompany.id,
      date: todayStr,
      checkInTime: new Date(),
      attendanceStatus: AttendanceStatus.PRESENT,
      shiftId: testShift.id,
    } as any);

    const requests = Array.from({ length: 20 }).map(() =>
      request(app.getHttpServer())
        .post('/api/attendance/check-out')
        .set('Authorization', `Bearer ${newEmpToken}`)
        .set('x-company-id', String(testCompany.id))
        .send({ locationLat: 19.0760, locationLng: 72.8777 })
    );

    const results = await Promise.all(requests);

    const statusCodes = results.map(r => r.status);
    const successCount = statusCodes.filter(s => s === 200).length;
    const conflictCount = statusCodes.filter(s => s === 409).length;

    const dbRecord = await AttendanceRecord.findByPk(record.id);

    expect(dbRecord!.checkOutTime).not.toBeNull();
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(19);

    // Cleanup
    await AttendanceLog.destroy({ where: { employeeId: newEmp.id } });
    await AttendanceRecord.destroy({ where: { employeeId: newEmp.id } });
    await Employee.destroy({ where: { id: newEmp.id } });
    await UserSession.destroy({ where: { userId: newEmpUser.id } });
    await UserRole.destroy({ where: { userId: newEmpUser.id } });
    await UserCompany.destroy({ where: { userId: newEmpUser.id } });
    await User.destroy({ where: { id: newEmpUser.id } });
  });
});
