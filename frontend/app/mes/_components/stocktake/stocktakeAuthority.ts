/** Only department approval roles grant access to round management and history. */
export function canManageStocktakeRounds(operator: { department_role?: string }): boolean {
  return operator.department_role === "primary" || operator.department_role === "deputy";
}
