from app.permissions import require_membership


def switch_organization(user, organization_id):
    require_membership(user, organization_id)
    return {'active_organization_id': organization_id}
