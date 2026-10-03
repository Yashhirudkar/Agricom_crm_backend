const fs = require('fs');
const path = require('path');

const masterDirs = [
  'bag-specs', 'category', 'common', 'country', 'currency', 'equipment-option',
  'financial-year', 'partner', 'partner-role', 'payment-term', 'product',
  'shipment-type', 'trade-document', 'warehouse'
];

function updateController(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  if (!content.includes('RequireAnyPermission')) {
    content = content.replace(
      "import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';",
      "import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';\nimport { RequireAnyPermission } from '../../rbac/decorators/require-any-permission.decorator';"
    );
  }

  // Find all @RequirePermission('something:view') and replace them
  content = content.replace(/@RequirePermission\('([a-zA-Z0-9_-]+):view'\)/g, (match, p1) => {
    return `@RequireAnyPermission('${p1}:view', 'sales_contract:view', 'purchase_contract:view', 'enquiry:view')`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${path.basename(filePath)}`);
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.controller.ts')) {
      updateController(fullPath);
    }
  }
}

masterDirs.forEach(dir => {
  const dirPath = path.join(__dirname, 'src/masters', dir);
  if (fs.existsSync(dirPath)) {
    processDirectory(dirPath);
  }
});

console.log('All controllers updated');
