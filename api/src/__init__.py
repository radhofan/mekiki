import typing
import typing_extensions

# Compatibility shim for Python 3.10 where NotRequired is in typing_extensions
if not hasattr(typing, 'NotRequired'):
    setattr(typing, 'NotRequired', typing_extensions.NotRequired)

try:
    import litellm.types.utils as _litellm_utils

    if not hasattr(_litellm_utils, 'ChatCompletionReasoningSummaryTextBlock'):
        setattr(_litellm_utils, 'ChatCompletionReasoningSummaryTextBlock', typing.Any)
except ImportError:
    pass
