import { Op } from 'sequelize';

export function buildSearchQuery(
  searchText: string | undefined,
  fields: string[],
): any {
  if (!searchText || !fields || fields.length === 0) {
    return {};
  }

  const conditions = fields.map((field) => ({
    [field]: { [Op.iLike]: `%${searchText}%` },
  }));

  return {
    [Op.or]: conditions,
  };
}
