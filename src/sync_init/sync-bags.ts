import { Category } from '../masters/category/category.model';
import { Product } from '../masters/product/product.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../masters/bag-specs/models/bag-specification.model';
import { ProductBagAssignment } from '../masters/bag-specs/models/product-bag-assignment.model';

export const syncBags = async () => {
  console.log('--- Syncing Bag Specifications & Masters Models ---');
  await Category.sync({ alter: true });
  await Product.sync({ alter: true });
  await BagType.sync({ alter: true });
  await PackingType.sync({ alter: true });
  await BagSpecification.sync({ alter: true });
  await ProductBagAssignment.sync({ alter: true });
  console.log('--- Bag Specifications & Masters Models Synced successfully ---');
};
