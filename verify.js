const http = require('http');

async function testEndpoint(path) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: 'localhost',
            port: 5000,
            path: path,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, data });
            });
        });
        req.on('error', reject);
    });
}

async function run() {
    try {
        console.log('Testing endpoints...');
        
        // Since we don't have auth, we might get 401, but the main point is no 500
        const myMenuRes = await testEndpoint('/api/auth/my-menu');
        console.log('/api/auth/my-menu status:', myMenuRes.statusCode);

        const sidebarTreeRes = await testEndpoint('/api/system/sidebar/tree');
        console.log('/api/system/sidebar/tree status:', sidebarTreeRes.statusCode);
        
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();
