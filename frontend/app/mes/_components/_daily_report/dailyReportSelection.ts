type ReportAuthor = { employee_id: string };

export function resolveSelectedReportAuthorId(
  preferredEmployeeId: string | null,
  authors: ReportAuthor[],
  isFetching: boolean,
  isError: boolean,
): string | null {
  if (!preferredEmployeeId || isFetching || isError) return preferredEmployeeId;
  return authors.some((author) => author.employee_id === preferredEmployeeId)
    ? preferredEmployeeId
    : null;
}
