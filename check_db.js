const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

async function run() {
  const sequelize = new Sequelize('postgresql://postgres:admin@localhost:5432/Agricom_db', { logging: false });
  
  function findDecorators(dir, permissions = new Set()) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        findDecorators(fullPath, permissions);
      } else if (fullPath.endsWith('.controller.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const regex = /@RequirePermission\(['"]([^'"]+)['"]\)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          permissions.add(match[1]);
        }
      }
    }
    return permissions;
  }

  const discovered = Array.from(findDecorators(path.join(process.cwd(), 'src')));
  console.log('Decorators:', discovered);

  const items = await sequelize.query('SELECT id, name, permission_link FROM sidebar_items', { type: Sequelize.QueryTypes.SELECT });
  
  const mismatches = [];
  for (const item of items) {
    if (item.permission_link && !discovered.includes(item.permission_link)) {
      mismatches.push(item);
    }
  }

  console.log('Mismatches:', mismatches);
  
  // Also check for orphans (permission link exists, but no controller)
  // This is actually what mismatches is finding.
  
  // Find duplicate sidebar_items names
  const duplicates = await sequelize.query('SELECT name, count(*) as count FROM sidebar_items GROUP BY name HAVING count(*) > 1', { type: Sequelize.QueryTypes.SELECT });
  console.log('Duplicates:', duplicates);

}

run().catch(console.error).then(() => process.exit(0));
