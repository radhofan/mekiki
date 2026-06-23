import io
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_path: str) -> str:
    '''
    Extract raw text from a PDF file.
    Tries pdfplumber first (best quality), falls back to PyPDF2.
    Returns the extracted text, or raises if extraction completely fails.
    '''
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f'PDF not found at path: {file_path}')

    # ── Attempt 1: pdfplumber ─────────────────────────────────────────────────
    try:
        import pdfplumber  # type: ignore[import-untyped]
        with pdfplumber.open(path) as pdf:
            pages_text: list[str] = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            result = '\n'.join(pages_text).replace('\x00', '').strip()
            if result:
                logger.info('pdfplumber extracted %d chars from %s', len(result), path.name)
                return result
    except Exception as exc:
        logger.warning('pdfplumber failed (%s), falling back to PyPDF2', exc)

    # ── Attempt 2: PyPDF2 ─────────────────────────────────────────────────────
    try:
        from PyPDF2 import PdfReader  # type: ignore[import-untyped]
        reader = PdfReader(str(path))
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                # Encode/decode round-trip to strip invalid unicode bytes
                clean = text.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                pages_text.append(clean)
        result = '\n'.join(pages_text).replace('\x00', '').strip()
        if result:
            logger.info('PyPDF2 extracted %d chars from %s', len(result), path.name)
            return result
    except Exception as exc:
        logger.error('PyPDF2 also failed: %s', exc)

    raise ValueError(f'Could not extract text from PDF: {path.name}')


def _sanitise(text: str) -> str:
    '''Strip null bytes and control chars PostgreSQL UTF8 rejects.'''
    return text.replace('\x00', '').replace('\x0b', '').replace('\x0c', '').strip()


def extract_text_from_bytes(content: bytes) -> str:
    '''
    Extract raw text from PDF bytes (no file I/O — used for in-memory parsing).
    Same pdfplumber → PyPDF2 fallback strategy as extract_text_from_pdf.
    '''
    import io

    # ── Attempt 1: pdfplumber ─────────────────────────────────────────────────
    try:
        import pdfplumber  # type: ignore[import-untyped]
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_text: list[str] = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            result = _sanitise('\n'.join(pages_text))
            if result:
                return result
    except Exception as exc:
        logger.warning('pdfplumber (bytes) failed: %s', exc)

    # ── Attempt 2: PyPDF2 ─────────────────────────────────────────────────────
    try:
        from PyPDF2 import PdfReader  # type: ignore[import-untyped]
        reader = PdfReader(io.BytesIO(content))
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                clean = text.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                pages_text.append(clean)
        result = _sanitise('\n'.join(pages_text))
        if result:
            return result
    except Exception as exc:
        logger.error('PyPDF2 (bytes) failed: %s', exc)

    raise ValueError('Could not extract text from PDF bytes')

