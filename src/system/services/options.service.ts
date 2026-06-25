import { Injectable } from '@nestjs/common';
import {
  COMPANY_TYPES,
  INDUSTRY_TYPES,
  COMPANY_SIZES,
} from '../../constants/company-options';

@Injectable()
export class OptionsService {
  getAllOptions() {
    return {
      common: {
        statuses: [
          { value: 'Active', label: 'Active' },
          { value: 'Inactive', label: 'Inactive' },
        ],
      },
      users: {
        statuses: [
          { value: 'Active', label: 'Active' },
          { value: 'Inactive', label: 'Inactive' },
          { value: 'Suspended', label: 'Suspended' },
          { value: 'Invited', label: 'Invited' },
        ],
      },
      companies: {
        statuses: [
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INACTIVE', label: 'Inactive' },
          { value: 'SUSPENDED', label: 'Suspended' },
        ],
        types: COMPANY_TYPES.map((t) => ({ value: t, label: t })),
        industryTypes: INDUSTRY_TYPES,
        companySizes: COMPANY_SIZES,
      },
      hrms: {
        documentTypes: [
          { value: 'AADHAAR', label: 'Aadhaar Card' },
          { value: 'PAN', label: 'PAN Card' },
          { value: 'PASSPORT', label: 'Passport' },
          { value: 'DRIVING_LICENSE', label: 'Driving License' },
          { value: 'VOTER_ID', label: 'Voter ID' },
          { value: 'TENTH_MARKSHEET', label: '10th Marksheet' },
          { value: 'TWELFTH_MARKSHEET', label: '12th Marksheet' },
          { value: 'DEGREE_CERTIFICATE', label: 'Degree Certificate' },
          { value: 'RELIEVING_LETTER', label: 'Relieving Letter' },
          { value: 'EXPERIENCE_LETTER', label: 'Experience Letter' },
          { value: 'SALARY_SLIP', label: 'Salary Slip' },
          { value: 'BANK_STATEMENT', label: 'Bank Statement' },
          { value: 'CANCELLED_CHEQUE', label: 'Cancelled Cheque' },
          { value: 'PHOTOGRAPH', label: 'Photograph' },
          { value: 'RESUME', label: 'Resume' },
          { value: 'OTHER', label: 'Other' },
        ],
        employmentTypes: [
          { value: 'FULL_TIME', label: 'Full Time' },
          { value: 'PART_TIME', label: 'Part Time' },
          { value: 'CONTRACT', label: 'Contract' },
          { value: 'INTERNSHIP', label: 'Internship' },
          { value: 'PROBATION', label: 'Probation' },
          { value: 'CONSULTANT', label: 'Consultant' },
        ],
        workModes: [
          { value: 'OFFICE', label: 'Office' },
          { value: 'REMOTE', label: 'Remote' },
          { value: 'HYBRID', label: 'Hybrid' },
        ],
        employeeStatuses: [
          { value: 'DRAFT', label: 'Draft' },
          { value: 'ONBOARDING', label: 'Onboarding' },
          { value: 'PROBATION', label: 'Probation' },
          { value: 'CONFIRMED', label: 'Confirmed' },
          { value: 'NOTICE_PERIOD', label: 'Notice Period' },
          { value: 'RESIGNED', label: 'Resigned' },
          { value: 'TERMINATED', label: 'Terminated' },
        ],
        verificationStatuses: [
          { value: 'PENDING', label: 'Pending' },
          { value: 'VERIFIED', label: 'Verified' },
          { value: 'REJECTED', label: 'Rejected' },
        ],
        holidayTypes: [
          { value: 'PUBLIC', label: 'Public Holiday' },
          { value: 'RESTRICTED', label: 'Restricted Holiday' },
          { value: 'COMPANY', label: 'Company Holiday' },
          { value: 'SHUTDOWN', label: 'Office Shutdown' },
          { value: 'FESTIVAL', label: 'Festival Holiday' },
          { value: 'REGIONAL', label: 'Regional Holiday' },
        ],
      },
      masters: {
        partnerStatuses: [
          { value: 'LEAD', label: 'Lead' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INACTIVE', label: 'Inactive' },
          { value: 'SUSPENDED', label: 'Suspended' },
        ],
        financialStatuses: [
          { value: 'Excellent', label: 'Excellent' },
          { value: 'Good', label: 'Good' },
          { value: 'Average', label: 'Average' },
          { value: 'Poor', label: 'Poor' },
          { value: 'Blacklisted', label: 'Blacklisted' },
        ],
      },
    };
  }
}
