from app.services import switch_organization


def test_switches_active_organization():
    user = type('User', (), {'organization_ids': ['org-1']})()
    assert switch_organization(user, 'org-1')['active_organization_id'] == 'org-1'
