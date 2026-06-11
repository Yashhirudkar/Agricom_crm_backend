import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:5000/api';

async function testSuite() {
  console.log('[Test] Starting Verification Test Suite...');

  // 1. Login as Super Admin to set up test environment
  console.log('[Test] Logging in as Super Admin...');
  let loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@agricom.com',
      password: 'Admin@123'
    })
  });

  if (!loginRes.ok) {
    console.error('[Test] Failed to log in as Super Admin. Is the server running? Status:', loginRes.status);
    process.exit(1);
  }

  const superAdminData = await loginRes.json();
  const superToken = superAdminData.accessToken;
  console.log('[Test] Super Admin authenticated.');

  // Pre-cleanup: Delete any existing Client A and Client B if they exist
  console.log('[Test] Cleaning up any pre-existing test clients...');
  const getClientsRes = await fetch(`${API_URL}/clients/GetClients`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${superToken}` }
  });
  if (getClientsRes.ok) {
    const clients = await getClientsRes.json();
    console.log('[Test] Clients list in DB:', clients);
    const existingClientA = clients.find((c: any) => c.email === 'admin@clienta.com');
    const existingClientB = clients.find((c: any) => c.email === 'admin@clientb.com');
    if (existingClientA) {
      console.log(`[Test] Found pre-existing Client A (ID: ${existingClientA.id}). Deleting...`);
      await fetch(`${API_URL}/clients/DeleteClient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify({ id: existingClientA.id })
      });
    }
    if (existingClientB) {
      console.log(`[Test] Found pre-existing Client B (ID: ${existingClientB.id}). Deleting...`);
      await fetch(`${API_URL}/clients/DeleteClient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify({ id: existingClientB.id })
      });
    }
  }

  // Create Client A and Client B
  console.log('[Test] Creating Client A and Client B...');
  const clientARes = await fetch(`${API_URL}/clients/CreateClient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify({ name: 'Client A Tenant', email: 'admin@clienta.com', password: 'password123', allowedCompanies: 5, allowedUsers: 10 })
  });
  if (!clientARes.ok) {
    console.error('[Test] Failed to create Client A. Status:', clientARes.status, await clientARes.text());
    process.exit(1);
  }
  const clientA = await clientARes.json();

  const clientBRes = await fetch(`${API_URL}/clients/CreateClient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify({ name: 'Client B Tenant', email: 'admin@clientb.com', password: 'password123', allowedCompanies: 5, allowedUsers: 10 })
  });
  if (!clientBRes.ok) {
    console.error('[Test] Failed to create Client B. Status:', clientBRes.status, await clientBRes.text());
    process.exit(1);
  }
  const clientB = await clientBRes.json();
  console.log(`[Test] Client A ID: ${clientA.id}, Client B ID: ${clientB.id}`);

  // Resolve Client A Admin and Client B Admin users
  console.log('[Test] Logging in as Client A Admin...');
  const clientALoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clienta.com', password: 'password123' })
  });
  if (!clientALoginRes.ok) {
    console.error('[Test] Client A Admin login failed. Status:', clientALoginRes.status, await clientALoginRes.text());
    process.exit(1);
  }
  const clientAAdmin = await clientALoginRes.json();
  const clientAToken = clientAAdmin.accessToken;

  console.log('[Test] Logging in as Client B Admin...');
  const clientBLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clientb.com', password: 'password123' })
  });
  if (!clientBLoginRes.ok) {
    console.error('[Test] Client B Admin login failed. Status:', clientBLoginRes.status, await clientBLoginRes.text());
    process.exit(1);
  }
  const clientBAdmin = await clientBLoginRes.json();
  const clientBToken = clientBAdmin.accessToken;

  // Under Client A, create Company A1 and Company A2
  console.log('[Test] Creating Company A1 and Company A2 under Client A...');
  const companyA1Res = await fetch(`${API_URL}/CreateCompany`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ name: 'Company A1' })
  });
  if (!companyA1Res.ok) {
    console.error('[Test] Failed to create Company A1. Status:', companyA1Res.status, await companyA1Res.text());
    process.exit(1);
  }
  const companyA1 = await companyA1Res.json();

  const companyA2Res = await fetch(`${API_URL}/CreateCompany`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ name: 'Company A2' })
  });
  if (!companyA2Res.ok) {
    console.error('[Test] Failed to create Company A2. Status:', companyA2Res.status, await companyA2Res.text());
    process.exit(1);
  }
  const companyA2 = await companyA2Res.json();

  // Under Client B, create Company B1
  console.log('[Test] Creating Company B1 under Client B...');
  const companyB1Res = await fetch(`${API_URL}/CreateCompany`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientBToken}` },
    body: JSON.stringify({ name: 'Company B1' })
  });
  if (!companyB1Res.ok) {
    console.error('[Test] Failed to create Company B1. Status:', companyB1Res.status, await companyB1Res.text());
    process.exit(1);
  }
  const companyB1 = await companyB1Res.json();

  // Create User B under Client B (for cross-tenant checks)
  console.log('[Test] Creating User B under Client B...');
  const userBRes = await fetch(`${API_URL}/CreateUser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientBToken}` },
    body: JSON.stringify({
      name: 'User B',
      email: 'userb@clientb.com',
      password: 'password123',
      companies: [{ companyId: companyB1.id }]
    })
  });
  if (!userBRes.ok) {
    console.error('[Test] Failed to create User B. Status:', userBRes.status, await userBRes.text());
    process.exit(1);
  }
  const userB = await userBRes.json();

  console.log('--------------------------------------------------');
  console.log('TEST 1: Cross-Tenant Security Verification');
  console.log('--------------------------------------------------');

  // Client A Admin tries to modify Company B1 (belongs to Client B)
  console.log('[Test 1.1] Client A Admin attempts to rename Company B1 (Client B)...');
  const updateCompanyRes = await fetch(`${API_URL}/UpdateCompany`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ id: companyB1.id, name: 'Hacked Company B1' })
  });
  console.log(`[Test 1.1] Response Status: ${updateCompanyRes.status} (Expected: 403)`);
  if (updateCompanyRes.status === 403) {
    console.log('=> SUCCESS: Cross-tenant company modification blocked.');
  } else {
    console.error('=> FAILURE: Cross-tenant company modification allowed!');
  }

  // Client A Admin tries to delete User B (belongs to Client B)
  console.log('[Test 1.2] Client A Admin attempts to delete User B (Client B)...');
  const deleteUserRes = await fetch(`${API_URL}/DeleteUser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ id: userB.id })
  });
  console.log(`[Test 1.2] Response Status: ${deleteUserRes.status} (Expected: 403)`);
  if (deleteUserRes.status === 403) {
    console.log('=> SUCCESS: Cross-tenant user deletion blocked.');
  } else {
    console.error('=> FAILURE: Cross-tenant user deletion allowed!');
  }

  console.log('--------------------------------------------------');
  console.log('TEST 2: Workspace Role Resolution Verification');
  console.log('--------------------------------------------------');

  // Create two custom roles under Client A (Manager and Viewer) or fetch standard roles
  // We can use system roles since they are globally available.
  // We will assign a user "Rahul" to Company A1 as "Manager" (roleId = 1 or we search for role 'Admin' or create test roles)
  // Let's retrieve available roles first
  console.log('[Test 2.1] Fetching roles for Client A...');
  const getRolesResRes = await fetch(`${API_URL}/GetRoles`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${clientAToken}` }
  });
  if (!getRolesResRes.ok) {
    console.error('[Test] Failed to fetch roles. Status:', getRolesResRes.status, await getRolesResRes.text());
    process.exit(1);
  }
  const roles = await getRolesResRes.json();
  const adminRole = roles.find((r: any) => r.name === 'Admin');
  const clientAdminRole = roles.find((r: any) => r.name === 'Client Admin');
  
  // Let's create two custom roles for Client A: "Sales Manager" and "Field Agent"
  const salesRoleRes = await fetch(`${API_URL}/CreateRole`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ name: 'Sales Manager', description: 'Manages sales scope' })
  });
  if (!salesRoleRes.ok) {
    console.error('[Test] Failed to create Sales Manager role. Status:', salesRoleRes.status, await salesRoleRes.text());
    process.exit(1);
  }
  const salesRole = await salesRoleRes.json();

  const agentRoleRes = await fetch(`${API_URL}/CreateRole`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ name: 'Field Agent', description: 'Field sales scope' })
  });
  if (!agentRoleRes.ok) {
    console.error('[Test] Failed to create Field Agent role. Status:', agentRoleRes.status, await agentRoleRes.text());
    process.exit(1);
  }
  const agentRole = await agentRoleRes.json();

  // Create User "Rahul" under Client A
  console.log('[Test 2.2] Creating user "Rahul" under Client A...');
  const rahulRes = await fetch(`${API_URL}/CreateUser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({
      name: 'Rahul',
      email: 'rahul@clienta.com',
      password: 'password123',
      companies: [
        { companyId: companyA1.id, roleId: salesRole.id },
        { companyId: companyA2.id, roleId: agentRole.id }
      ]
    })
  });
  if (!rahulRes.ok) {
    console.error('[Test] Failed to create Rahul. Status:', rahulRes.status, await rahulRes.text());
    process.exit(1);
  }
  const rahul = await rahulRes.json();
  console.log(`[Test] Rahul user created: ${rahul.id}`);

  // Log in as Rahul
  console.log('[Test 2.3] Logging in as Rahul...');
  const rahulLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rahul@clienta.com', password: 'password123' })
  });
  if (!rahulLoginRes.ok) {
    console.error('[Test] Rahul login failed. Status:', rahulLoginRes.status, await rahulLoginRes.text());
    process.exit(1);
  }
  const rahulAuth = await rahulLoginRes.json();
  const rahulToken = rahulAuth.accessToken;

  // Fetch Rahul's profile with x-company-id = A1 (Company A1)
  console.log('[Test 2.4] Querying profile (/auth/me) with x-company-id = A1...');
  const profileA1Res = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${rahulToken}`, 'x-company-id': companyA1.id.toString() }
  });
  if (!profileA1Res.ok) {
    console.error('[Test] Rahul profile A1 failed. Status:', profileA1Res.status, await profileA1Res.text());
    process.exit(1);
  }
  const profileA1 = await profileA1Res.json();
  console.log(`[Test 2.4] Resolved active role inside Company A1: ${profileA1.workspaces.find((w: any) => w.id === companyA1.id)?.role?.name || 'None'}`);

  // Fetch Rahul's profile with x-company-id = A2 (Company A2)
  console.log('[Test 2.5] Querying profile (/auth/me) with x-company-id = A2...');
  const profileA2Res = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${rahulToken}`, 'x-company-id': companyA2.id.toString() }
  });
  if (!profileA2Res.ok) {
    console.error('[Test] Rahul profile A2 failed. Status:', profileA2Res.status, await profileA2Res.text());
    process.exit(1);
  }
  const profileA2 = await profileA2Res.json();
  console.log(`[Test 2.5] Resolved active role inside Company A2: ${profileA2.workspaces.find((w: any) => w.id === companyA2.id)?.role?.name || 'None'}`);

  // Check if they switch correctly
  if (profileA1.workspaces.find((w: any) => w.id === companyA1.id)?.role?.name === 'Sales Manager' &&
      profileA2.workspaces.find((w: any) => w.id === companyA2.id)?.role?.name === 'Field Agent') {
    console.log('=> SUCCESS: Workspace role resolution verified successfully!');
  } else {
    console.error('=> FAILURE: Role did not resolve correctly based on workspace header!');
  }

  console.log('--------------------------------------------------');
  console.log('TEST 3: User Invitation Flow Verification');
  console.log('--------------------------------------------------');

  // Client A Admin creates invitation for new user
  console.log('[Test 3.1] Creating user invitation...');
  const createInviteRes = await fetch(`${API_URL}/invitations/CreateInvitation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({
      email: 'invitee@clienta.com',
      roleId: salesRole.id,
      companyIds: [companyA1.id, companyA2.id]
    })
  });
  if (!createInviteRes.ok) {
    console.error('[Test 3.1] Failed to create invitation. Status:', createInviteRes.status, await createInviteRes.text());
    process.exit(1);
  }
  const invitation = await createInviteRes.json();
  const token = invitation.token;
  console.log(`[Test 3.1] Invitation created successfully. Token: ${token}`);

  // Public verifies invitation token
  console.log('[Test 3.2] Verifying invitation token...');
  const verifyInviteRes = await fetch(`${API_URL}/invitations/verify?token=${token}`);
  if (!verifyInviteRes.ok) {
    console.error('[Test 3.2] Failed to verify invitation. Status:', verifyInviteRes.status, await verifyInviteRes.text());
    process.exit(1);
  }
  const verifyDetails = await verifyInviteRes.json();
  console.log(`[Test 3.2] Token verified. Client: ${verifyDetails.client?.name}, Role: ${verifyDetails.role?.name}, Companies: ${verifyDetails.companies?.map((c: any) => c.name).join(', ')}`);

  // Public accepts invitation
  console.log('[Test 3.3] Accepting invitation...');
  const acceptInviteRes = await fetch(`${API_URL}/invitations/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      name: 'Invited User',
      password: 'password123'
    })
  });
  if (!acceptInviteRes.ok) {
    console.error('[Test 3.3] Failed to accept invitation. Status:', acceptInviteRes.status, await acceptInviteRes.text());
    process.exit(1);
  }
  const acceptedUser = await acceptInviteRes.json();
  console.log(`[Test 3.3] Invitation accepted. Created User ID: ${acceptedUser.id}, Email: ${acceptedUser.email}`);

  // Test log in of new user
  console.log('[Test 3.4] Logging in as new user...');
  const newLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invitee@clienta.com', password: 'password123' })
  });
  if (!newLoginRes.ok) {
    console.error('[Test 3.4] Login as invited user failed. Status:', newLoginRes.status, await newLoginRes.text());
    process.exit(1);
  }
  const newAuth = await newLoginRes.json();
  const newToken = newAuth.accessToken;
  console.log('[Test 3.4] Invited user logged in successfully.');

  console.log('--------------------------------------------------');
  console.log('TEST 4: Audit Logs and JSON Diffs Verification');
  console.log('--------------------------------------------------');

  // Perform an update to trigger a log (e.g. update company name)
  console.log('[Test 4.1] Modifying Company A1...');
  const renameRes = await fetch(`${API_URL}/UpdateCompany`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientAToken}` },
    body: JSON.stringify({ id: companyA1.id, name: 'Renamed Company A1' })
  });
  if (!renameRes.ok) {
    console.error('[Test 4.1] Failed to rename Company. Status:', renameRes.status, await renameRes.text());
    process.exit(1);
  }
  console.log('[Test 4.1] Company A1 renamed.');

  // Retrieve audit logs via Super Admin
  console.log('[Test 4.2] Retrieving audit logs...');
  const auditLogsRes = await fetch(`${API_URL}/audit/logs?clientId=${clientA.id}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${superToken}` }
  });
  if (!auditLogsRes.ok) {
    console.error('[Test 4.2] Failed to fetch audit logs. Status:', auditLogsRes.status, await auditLogsRes.text());
    process.exit(1);
  }
  const auditLogs = await auditLogsRes.json();
  
  // Find the company update log
  const companyUpdateLog = auditLogs.find((l: any) => l.entityType === 'Company' && l.action === 'UPDATE' && l.entityId === companyA1.id);
  if (companyUpdateLog) {
    console.log('[Test 4.2] Found company update audit log.');
    console.log('=> Old Value:', JSON.stringify(companyUpdateLog.oldValue));
    console.log('=> New Value:', JSON.stringify(companyUpdateLog.newValue));
    if (companyUpdateLog.oldValue?.name === 'Company A1' && companyUpdateLog.newValue?.name === 'Renamed Company A1') {
      console.log('=> SUCCESS: Audit logs show correct old vs new diff values.');
    } else {
      console.error('=> FAILURE: Audit logs show incorrect values!');
    }
  } else {
    console.error('=> FAILURE: Company update audit log not found!');
  }

  // Double check that password was not logged in User CREATE log
  const userCreateLog = auditLogs.find((l: any) => l.entityType === 'User' && l.action === 'CREATE' && l.entityId === rahul.id);
  if (userCreateLog) {
    console.log('[Test 4.3] Found user create audit log.');
    if (userCreateLog.newValue && 'password' in userCreateLog.newValue) {
      console.error('=> FAILURE: Password field was logged in audit logs!');
    } else {
      console.log('=> SUCCESS: Audit logs do not contain sensitive fields (password).');
    }
  } else {
    console.log('[Test 4.3] Note: user create audit log not found (non-blocking for this subtest).');
  }

  console.log('--------------------------------------------------');
  console.log('TEST 5: Notification APIs Verification');
  console.log('--------------------------------------------------');

  // Create manual notification
  console.log('[Test 5.1] Creating notification...');
  const createNotifRes = await fetch(`${API_URL}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify({
      userId: rahul.id,
      title: 'Test Alert',
      message: 'This is a test notification',
      type: 'WARNING'
    })
  });
  if (!createNotifRes.ok) {
    console.error('[Test 5.1] Failed to create notification. Status:', createNotifRes.status, await createNotifRes.text());
    process.exit(1);
  }
  const createdNotif = await createNotifRes.json();
  console.log(`[Test 5.1] Notification created. ID: ${createdNotif.id}`);

  // Fetch notifications as Rahul
  console.log('[Test 5.2] Querying notifications for Rahul...');
  const getNotifsRes = await fetch(`${API_URL}/notifications`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${rahulToken}` }
  });
  if (!getNotifsRes.ok) {
    console.error('[Test 5.2] Failed to fetch notifications. Status:', getNotifsRes.status, await getNotifsRes.text());
    process.exit(1);
  }
  const notificationsList = await getNotifsRes.json();
  const rahulNotif = notificationsList.find((n: any) => n.id === createdNotif.id);
  if (rahulNotif && rahulNotif.title === 'Test Alert' && rahulNotif.isRead === false) {
    console.log('=> SUCCESS: Notification list returned active notification.');
  } else {
    console.error('=> FAILURE: Active notification not returned correctly!');
  }

  // Mark notification as read
  console.log('[Test 5.3] Marking notification as read...');
  const markReadRes = await fetch(`${API_URL}/notifications/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${rahulToken}` },
    body: JSON.stringify({ id: createdNotif.id })
  });
  if (!markReadRes.ok) {
    console.error('[Test 5.3] Failed to mark notification as read. Status:', markReadRes.status, await markReadRes.text());
    process.exit(1);
  }
  const markedNotif = await markReadRes.json();
  if (markedNotif.isRead === true) {
    console.log('=> SUCCESS: Notification marked as read.');
  } else {
    console.error('=> FAILURE: Notification read state not updated!');
  }

  // Cleanup: Delete created Clients via Super Admin
  console.log('[Test] Cleaning up test clients...');
  await fetch(`${API_URL}/clients/DeleteClient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify({ id: clientA.id })
  });
  await fetch(`${API_URL}/clients/DeleteClient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify({ id: clientB.id })
  });
  console.log('[Test] Cleanup done. Test Suite Finished.');
}

testSuite();
