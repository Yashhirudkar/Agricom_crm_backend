const fs = require('fs');
const path = require('path');

const modelsDir = 'a:\\agricom crm\\backend\\src\\tasks\\models';
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

const companyImport = "import { Company } from '../../companies/models/company.model';\n";

const companyField = `
  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;
`;

for (const file of files) {
  const filePath = path.join(modelsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('company_id')) {
    console.log(`Skipping ${file} as it already has companyId`);
    continue;
  }

  // 1. Add import after last import
  const lastImportIndex = content.lastIndexOf("from '");
  if (lastImportIndex !== -1) {
    const endOfLastImport = content.indexOf(';', lastImportIndex);
    if (endOfLastImport !== -1) {
      content = content.slice(0, endOfLastImport + 1) + '\n' + companyImport + content.slice(endOfLastImport + 1);
    }
  }

  // 2. Insert field inside the class, right after `export class ... {`
  const classMatch = content.match(/export\s+class\s+\w+\s+extends\s+Model<[^>]+>\s*\{/);
  if (classMatch) {
    const insertPos = classMatch.index + classMatch[0].length;
    content = content.slice(0, insertPos) + '\n' + companyField + content.slice(insertPos);
    
    // Check if ForeignKey and BelongsTo are imported from sequelize-typescript
    if (!content.includes('ForeignKey,')) {
      content = content.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'sequelize-typescript';/, (match, p1) => {
        const imports = p1.split(',').map(s => s.trim()).filter(s => s);
        if (!imports.includes('ForeignKey')) imports.push('ForeignKey');
        if (!imports.includes('BelongsTo')) imports.push('BelongsTo');
        return `import {\n  ${imports.join(',\n  ')}\n} from 'sequelize-typescript';`;
      });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
