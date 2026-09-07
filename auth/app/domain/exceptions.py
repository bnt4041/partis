"""Domain/application errors. The HTTP adapter maps these to status codes -
the use cases themselves know nothing about HTTP."""


class DomainError(Exception):
    pass


class TenantSlugTaken(DomainError):
    pass


class TenantNotFound(DomainError):
    pass


class UsernameTaken(DomainError):
    pass


class InvalidCredentials(DomainError):
    pass


class NotAuthorized(DomainError):
    """The caller is authenticated but doesn't hold a role allowed to do this."""

    pass


class AmbiguousLogin(DomainError):
    """The username/password pair matches more than one account (the same
    person can belong to several organizations) - the caller must pick one
    and log in again with that organization specified."""

    def __init__(self, choices):
        self.choices = choices
        super().__init__("ambiguous login: more than one matching account")
