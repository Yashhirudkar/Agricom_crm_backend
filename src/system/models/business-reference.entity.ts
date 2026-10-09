import { Model } from 'sequelize-typescript';

/**
 * Shared Sequelize base for trade documents (enquiries, contracts, logistics, etc.).
 * Subclasses define their own columns; this only wires correct Model typing for Nest/Sequelize.
 */
export abstract class BusinessReferenceEntity<
  TModel extends Model,
> extends Model<TModel> {}
