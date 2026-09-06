import typing
import typing_extensions

# Compatibility shim for Python 3.10 where NotRequired is in typing_extensions
if not hasattr(typing, 'NotRequired'):
    setattr(typing, 'NotRequired', typing_extensions.NotRequired)
