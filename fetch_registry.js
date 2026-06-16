const jwt = require('jsonwebtoken');
const http = require('http');

const secret = 'super-secret-jwt-key-agricom-crm-2026';
const token = jwt.sign(
  { sub: 1, type: 'super_admin', clientId: null },
  secret,
  { expiresIn: '1h' }
);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/GetPermissionRegistry',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    try {
      const parsed = JSON.parse(data);
      console.log('Response JSON keys/structure:');
      console.log(Object.keys(parsed));
      if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`Array length: ${parsed.length}`);
          console.log('First item:', parsed[0]);
      } else {
          console.log(parsed);
      }
    } catch (e) {
      console.log('Raw Response:');
      console.log(data);
    }
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
