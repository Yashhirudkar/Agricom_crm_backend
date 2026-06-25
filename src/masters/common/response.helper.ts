export function buildPaginatedResponse<T>(
  rows: T[],
  count: number,
  page: number,
  limit: number,
) {
  const finalPage = Number(page) || 1;
  const finalLimit = Number(limit) || 10;

  return {
    data: rows,
    total: count,
    page: finalPage,
    limit: finalLimit,
    totalPages: Math.ceil(count / finalLimit),
  };
}
