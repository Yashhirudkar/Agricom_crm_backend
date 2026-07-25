# 📋 Agricom CRM - Migration README

## Quick Start

```bash
# Saare pending phases ek saath run karo
npm run migrate

# Status check karo
npm run migrate:status

# Specific phase run karo (e.g. phase 05 - HRMS)
npm run migrate:phase 05

# Fresh start (sab drop + re-run)
npm run migrate:fresh
```

## File Structure

```
src/database/migrations/
├── runner.ts              ← Master trigger (yahi ek file run karo)
├── index.ts               ← Phase registry
├── phase-01-core.ts       ← clients, users, companies, departments
├── phase-02-system.ts     ← app_modules, module_resources, resource_actions, sidebar_folders, sidebar_items, system_audit_logs
├── phase-03-rbac.ts       ← roles, user_roles, role_action_permissions
├── phase-04-client-access.ts ← client_module_access, client_folder_access, client_item_access, client_action_access
├── phase-05-hrms.ts       ← branches, designations, shifts, employees, employee_documents, employee_lifecycle_logs
├── phase-06-attendance.ts ← company_break_policies, attendance_records, attendance_logs, attendance_exceptions
├── phase-07-leaves.ts     ← leave_types, leave_requests, leave_approval_steps, leave_approval_logs, employee_leave_balances, leave_balance_history
├── phase-08-masters.ts    ← countries, currencies, categories, hs_codes, financial_years, payment_terms, shipment_types, trade_documents
├── phase-09-partners.ts   ← partner_roles, partner_role_dynamic_configs, partner_dynamic_config_history, partners, partner_contacts, partner_dynamic_values, partner_followups, products, partner_products, bag_types, packing_types, bag_specifications, product_bag_assignments
├── phase-10-sales.ts      ← sales_contracts, sales_contract_items, sales_contract_shipments, sales_contract_documents, sales_contract_document_files
├── phase-11-tasks.ts      ← task_statuses, task_priorities, task_labels, tasks, task_assignees, task_comments, task_comment_history, task_comment_mentions, task_checklists, task_attachments, task_label_maps, task_time_logs, task_dependencies, task_custom_fields, task_custom_field_values, task_sequences, task_sla_rules, task_status_transitions, task_recurrences, task_recurrence_exceptions, task_templates, task_template_items, task_activities
└── phase-12-others.ts     ← holidays, holiday_companies, enquiries, attachments, audit_logs, profile_activity_logs, user_invitations, user_password_history, user_preferences, user_sessions, user_companies, company_hr_policies
```

## Total Tables: ~75

| Phase | Tables Created |
|-------|---------------|
| 01 | 4 |
| 02 | 6 |
| 03 | 3 |
| 04 | 4 |
| 05 | 6 |
| 06 | 4 |
| 07 | 6 |
| 08 | 8 |
| 09 | 13 |
| 10 | 5 |
| 11 | 23 |
| 12 | 12 |
| **Total** | **~94** |

## Features

- ✅ **Idempotent**: `CREATE TABLE IF NOT EXISTS` - dubara run karo, koi error nahi
- ✅ **Dependency Order**: Phase 01 > 02 > ... > 12 (FK dependencies respect ki gayi hain)
- ✅ **Status Tracking**: `migrations_log` table DB mein track karta hai kaunse phases run hue
- ✅ **Individual Run**: Koi bhi ek phase akela run kar sakte ho
- ✅ **Rollback**: Har phase ka `down()` function hai jo tables drop karta hai
- ✅ **Fresh Start**: `npm run migrate:fresh` sab kuch drop karke fresh banata hai
- ✅ **Error Safe**: Ek phase fail ho toh baaki phases affect nahi hote
