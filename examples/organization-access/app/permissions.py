def require_membership(user, organization_id):
    if organization_id not in user.organization_ids:
        raise PermissionError('organization membership required')
