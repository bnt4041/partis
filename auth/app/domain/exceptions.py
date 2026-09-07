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
