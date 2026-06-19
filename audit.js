const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllFiles(dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

const allFiles = getAllFiles(srcDir);
const controllerFiles = allFiles.filter(f => f.endsWith('.controller.ts'));

let totalControllers = controllerFiles.length;
let totalProtectedRoutes = 0;
let routesMissingPermissions = [];
let hardcodedChecks = [];
let duplicateSystems = new Set();
let controllersAnalyzed = [];

controllerFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const filename = path.basename(file);
  
  let currentRoute = null;
  let hasPermissionDec = false;
  
  let routeResults = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for route decorators
    const routeMatch = line.match(/@(Get|Post|Put|Delete|Patch)\((.*?)\)/);
    if (routeMatch) {
      currentRoute = `${routeMatch[1].toUpperCase()} ${routeMatch[2] || '/'}`;
      hasPermissionDec = false;
      
      // Look back for @RequirePermission
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (lines[j].includes('@RequirePermission') || lines[j].includes('@Permissions') || lines[j].includes('@CheckPermissions')) {
          const permMatch = lines[j].match(/@RequirePermission\(['"](.+?)['"]\)/);
          const perm = permMatch ? permMatch[1] : 'unknown';
          hasPermissionDec = true;
          totalProtectedRoutes++;
          routeResults.push(`${currentRoute} → ${perm} ✅`);
          break;
        }
      }
      
      if (!hasPermissionDec) {
        routesMissingPermissions.push(`${filename}: ${currentRoute}`);
        routeResults.push(`${currentRoute} ❌ MISSING RBAC`);
      }
    }
    
    // Check for hardcoded manual logic
    if (line.match(/req\.user\.type ===|actor\.type ===|isSystemAdmin|checkUserHasPermission|ForbiddenException\('Access denied'\)|throw new ForbiddenException/)) {
      hardcodedChecks.push(`${filename}:${i + 1}: ${line.trim()}`);
      if (line.includes('req.user.type ===') || line.includes('actor.type ===')) duplicateSystems.add('token.type based auth');
      if (line.includes('checkUserHasPermission')) duplicateSystems.add('manual controller checks');
      if (line.includes('ForbiddenException')) duplicateSystems.add('service layer permission checks');
    }
  }
  
  controllersAnalyzed.push({
    file: filename,
    routes: routeResults
  });
});

console.log("=== PHASE 1: Scan all controllers ===");
console.log(`Scanned ${totalControllers} controllers.`);

console.log("\n=== PHASE 2: Hardcoded Manual Logic ===");
hardcodedChecks.forEach(hc => console.log(hc));

console.log("\n=== PHASE 5: Controller Coverage Audit ===");
controllersAnalyzed.forEach(c => {
  console.log(`\n${c.file}`);
  c.routes.forEach(r => console.log(r));
});

console.log("\n=== ROUTES MISSING RBAC ===");
routesMissingPermissions.forEach(r => console.log(r));

console.log("\n=== PHASE 6: Duplicate Permission Systems ===");
console.log(Array.from(duplicateSystems).join(', '));
