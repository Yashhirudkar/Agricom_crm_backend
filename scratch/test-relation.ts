import { Sequelize } from 'sequelize-typescript';
import { Partner } from '../src/masters/partner/partner.model';
import { PartnerContact } from '../src/masters/partner/partner-contact.model';
import { PartnerProduct } from '../src/masters/partner/partner-product.model';
import { PartnerRole } from '../src/masters/partner-role/partner-role.model';
import { Country } from '../src/masters/country/country.model';
import { Product } from '../src/masters/product/product.model';
import { Category } from '../src/masters/category/category.model';
import { HSCode } from '../src/masters/hs-code/hs-code.model';

async function testRewrite() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'admin',
    database: 'Agricom_db',
    models: [Partner, PartnerContact, PartnerRole, Country, Product, PartnerProduct, Category, HSCode],
    logging: false,
  });

  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected successfully.');

    // Find or create a PartnerRole & Country first as foreign keys
    let role = await PartnerRole.findOne({ where: { isActive: true } });
    if (!role) {
      role = await PartnerRole.create({ name: 'TEST ROLE', isActive: true } as any);
    }
    let country = await Country.findOne({ where: { isActive: true } });
    if (!country) {
      country = await Country.create({ name: 'TEST COUNTRY', iso2Code: 'TC', iso3Code: 'TCO', isActive: true } as any);
    }

    console.log('Creating a test partner with Contacts A, B, and C...');
    const partner = await Partner.create({
      entityName: 'TEST RELATION RELATION',
      partnerRoleId: role.id,
      countryId: country.id,
      isActive: true
    } as any);

    await PartnerContact.create({ partnerId: partner.id, name: 'Contact A' } as any);
    await PartnerContact.create({ partnerId: partner.id, name: 'Contact B' } as any);
    await PartnerContact.create({ partnerId: partner.id, name: 'Contact C' } as any);

    console.log('Initial saved contacts in DB:');
    let contacts = await PartnerContact.findAll({ where: { partnerId: partner.id } });
    console.log(contacts.map(c => c.name));

    console.log('Performing update transaction (simulating deletion of Contact B)...');
    // Simulate updating partner with contacts A and C (deleting B)
    const newContacts = [
      { name: 'Contact A' },
      { name: 'Contact C' }
    ];

    await sequelize.transaction(async (transaction) => {
      // 1. Destroy all old contacts
      await PartnerContact.destroy({ where: { partnerId: partner.id }, transaction });
      // 2. Insert new list
      const contactsPayload = newContacts.map((c) => ({
        ...c,
        partnerId: partner.id,
      }));
      await PartnerContact.bulkCreate(contactsPayload, { transaction });
    });

    console.log('Transaction completed successfully.');

    // Fetch contacts from DB again to verify
    const updatedContacts = await PartnerContact.findAll({ where: { partnerId: partner.id } });
    console.log('Updated contacts in DB:');
    console.log(updatedContacts.map(c => c.name));

    if (
      updatedContacts.length === 2 &&
      updatedContacts.some(c => c.name === 'Contact A') &&
      updatedContacts.some(c => c.name === 'Contact C') &&
      !updatedContacts.some(c => c.name === 'Contact B')
    ) {
      console.log('SUCCESS: Deletion of Contact B verified successfully! No orphans or ghosts.');
    } else {
      console.error('FAILURE: Verified contacts mismatch.');
    }

    // Clean up test records
    await PartnerContact.destroy({ where: { partnerId: partner.id } });
    await partner.destroy();
    console.log('Cleanup finished.');
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await sequelize.close();
  }
}

testRewrite();
