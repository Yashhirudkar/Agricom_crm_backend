const fs = require('fs');
const path = require('path');

function getFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, filesList);
    } else if (fullPath.endsWith('.controller.ts')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const controllers = getFiles(path.join(__dirname, 'src'));
let totalMissing = 0;
const missingDetails = [];

for (const file of controllers) {
  const content = fs.readFileSync(file, 'utf8');
  
  // A rough regex to find method decorators for routes
  // Matches @Get(...), @Post(...), @Put(...), etc.
  const routeRegex = /@(Get|Post|Put|Patch|Delete)\b[^)]*\)\s*(?:@\w+\([^)]*\)\s*)*\s*(?:async\s+)?(\w+)\s*\(/g;
  
  let match;
  let hasMissing = false;
  const missingMethods = [];
  
  // Find all methods with route decorators
  while ((match = routeRegex.exec(content)) !== null) {
    const methodIndex = match.index;
    const methodName = match[2];
    
    // Look a little bit backwards to see if @RequirePermission is before this route decorator
    // or we can just parse the block of decorators before the method declaration.
    // Instead of complex regex, let's look at the lines above the method.
    const beforeMethod = content.substring(0, methodIndex + match[0].length);
    const lastMethodEnd = Math.max(
      beforeMethod.lastIndexOf('{', beforeMethod.lastIndexOf(methodName)),
      beforeMethod.lastIndexOf('}')
    );
    const methodBlock = beforeMethod.substring(Math.max(0, lastMethodEnd));
    
    if (!methodBlock.includes('@RequirePermission') && !content.substring(methodIndex, content.indexOf('(', methodIndex)).includes('@RequirePermission')) {
      missingMethods.push(methodName);
    }
  }
  
  if (missingMethods.length > 0) {
    missingDetails.push({ file: path.relative(__dirname, file), methods: missingMethods });
    totalMissing += missingMethods.length;
  }
}

console.log('--- Missing @RequirePermission ---');
if (missingDetails.length === 0) {
  console.log('All controllers have @RequirePermission decorators on all routes.');
} else {
  missingDetails.forEach(d => {
    console.log(`File: ${d.file}`);
    console.log(`  Methods: ${d.methods.join(', ')}`);
  });
  console.log(`\nTotal missing decorators: ${totalMissing}`);
}
