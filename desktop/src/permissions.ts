// What the dashboard's page may use: it shows notifications and needs nothing else.

/** Whether the window grants the page `permission`; only notifications are allowed. */
export function allowsPermission(permission: string): boolean {
  return permission === "notifications";
}
