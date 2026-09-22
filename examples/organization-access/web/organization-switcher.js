import { switchOrganization } from './session-api.js';

export function OrganizationSwitcher(organization) {
  return switchOrganization(organization.id);
}
