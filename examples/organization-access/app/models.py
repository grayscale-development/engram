class Organization:
    def __init__(self, organization_id, name):
        self.id = organization_id
        self.name = name


class Membership:
    def __init__(self, user_id, organization_id, role):
        self.user_id = user_id
        self.organization_id = organization_id
        self.role = role
