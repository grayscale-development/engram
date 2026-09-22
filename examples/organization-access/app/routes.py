from app.services import switch_organization


def post_switch_organization(request):
    return switch_organization(request.user, request.organization_id)
