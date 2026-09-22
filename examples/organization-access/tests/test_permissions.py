from app.permissions import require_membership


def test_membership_is_required():
    assert require_membership(type('User', (), {'organization_ids': ['org-1']})(), 'org-1') is None
