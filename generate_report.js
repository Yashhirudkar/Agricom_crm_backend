const fs = require('fs');

const enquiries = JSON.parse(fs.readFileSync('d:/Agricom_CRM/enquiries_dump.json', 'utf8'));

let md = `# Enquiries and Sales Contracts Deep Dive Report

This report contains a complete and exhaustive list of all enquiries, including their linked sales contracts, categorized by their current status. It also includes the exact history of the recent deletion of the **VA.2432627** contract.

---

## 1. Deletion History (VA.2432627 & ENQ-000057)

The table below outlines the exact changes made to the database when removing the sales contract **VA.2432627**.

| Entity | ID / Number | Action Taken | Reason / Result |
| :--- | :--- | :--- | :--- |
| **Sales Contract** | ID: \`18\` (VA.2432627) | **DELETED** | This was the first record found (Status was previously set to Cancelled). |
| **Sales Contract** | ID: \`19\` (VA.2432627) | **DELETED** | This was the duplicate/remaining active record for the same contract number. Removed to ensure complete deletion from DB. |
| **Enquiry** | ENQ-000057 (ID: 0015b533...) | **STATUS UPDATED** | Since its sales contracts were removed, its status was automatically reverted from **CONFIRMED** to **PENDING**. |

---

`;

// Categorize Enquiries
const pending = [];
const confirmed = [];
const closed = [];
const deleted = [];

enquiries.forEach(e => {
  if (e.deleted_at) {
    deleted.push(e);
  } else if (e.enquiry_status === 'CONFIRMED' || e.sales_contract_no) {
    confirmed.push(e);
  } else if (e.enquiry_status === 'CLOSED') {
    closed.push(e);
  } else {
    pending.push(e);
  }
});

const generateTable = (title, data) => {
  let table = `## ${title} (${data.length})\n\n`;
  if (data.length === 0) {
    return table + "_No records found in this category._\n\n";
  }
  
  table += `| Enquiry No | Date | Partner | Product | Qty | Status | Sales Contract | SC Status |\n`;
  table += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  
  data.forEach(e => {
    const date = e.enquiry_date ? new Date(e.enquiry_date).toLocaleDateString() : 'N/A';
    const partner = e.partner_name || 'N/A';
    const product = e.product_name || 'N/A';
    const qty = e.quantity ? parseFloat(e.quantity).toString() : 'N/A';
    const sc = e.sales_contract_no || '-';
    const sc_status = e.sales_contract_status || '-';
    
    table += `| **${e.enquiry_no}** | ${date} | ${partner} | ${product} | ${qty} | ${e.enquiry_status} | ${sc} | ${sc_status} |\n`;
  });
  
  return table + '\n';
};

md += generateTable('2. Active & Pending Enquiries', pending);
md += generateTable('3. Confirmed Enquiries (Orders / Sales Contracts Generated)', confirmed);
md += generateTable('4. Closed Enquiries', closed);
md += generateTable('5. Deleted / Inactive Enquiries (Soft Deleted)', deleted);

fs.writeFileSync('C:/Users/WIN 10/.gemini/antigravity-ide/brain/cf28ef48-ed77-44f1-a830-35d2647e322a/enquiries_detailed_report.md', md);
console.log("Markdown artifact generated successfully.");
