export function buildPagination(page: number = 1, limit: number = 10) {
  const parsedLimit = Number(limit) || 10;
  const parsedPage = Number(page) || 1;
  
  const finalLimit = Math.min(parsedLimit, 100);
  const finalPage = Math.max(parsedPage, 1);
  const offset = (finalPage - 1) * finalLimit;

  return {
    limit: finalLimit,
    offset,
  };
}
