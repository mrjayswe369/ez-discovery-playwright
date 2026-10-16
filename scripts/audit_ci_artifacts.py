"""Fail closed before uploading diagnostics; never print the matching secret."""
import base64
import io
import json
import os
import re
from pathlib import Path
from zipfile import ZipFile

SECRET_NAMES = ("BASE_URL", "TEST_EMAIL", "TEST_PASSWORD", "DISCOVERY_REGISTERED_GZIP_BASE64")
SECRETS = [os.environ[name].encode() for name in SECRET_NAMES if os.environ.get(name)]
TRACE_FIELDS = {
    "type", "callId", "parentId", "stepId", "startTime", "endTime", "wallTime",
    "monotonicTime", "method", "apiName", "class", "pageId", "browserName",
    "version", "origin", "platform", "sdkLanguage", "testIdAttributeName", "playwrightVersion", "options",
}


def check_bytes(data: bytes) -> None:
    for secret in SECRETS:
        variants = (secret, json.dumps(secret.decode())[1:-1].encode())
        if any(value in data for value in variants):
            raise ValueError("Artifact contains configured sensitive data; upload refused")


def check_trace(data: bytes) -> None:
    with ZipFile(io.BytesIO(data)) as archive:
        if not archive.namelist() or any(not name.endswith(".trace") for name in archive.namelist()):
            raise ValueError("Trace contains non-sanitized resources; upload refused")
        for name in archive.namelist():
            content = archive.read(name)
            check_bytes(content)
            for line in content.splitlines():
                event = json.loads(line)
                if event.get("type") not in {"before", "after", "context-options"}:
                    raise ValueError("Trace contains non-action events; upload refused")
                if set(event) - TRACE_FIELDS:
                    raise ValueError("Trace contains non-allowlisted fields; upload refused")
                if "options" in event and event["options"] != {"viewport": {"width": 1280, "height": 720}}:
                    raise ValueError("Trace contains non-sanitized context options; upload refused")


def audit() -> None:
    roots = (Path("playwright-report"), Path("test-results"))
    for root in roots:
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            data = path.read_bytes()
            check_bytes(data)
            if path.suffix == ".zip":
                check_trace(data)
            if path.name == "index.html":
                match = re.search(rb"data:application/zip;base64,([A-Za-z0-9+/=]+)", data)
                if match:
                    with ZipFile(io.BytesIO(base64.b64decode(match[1]))) as archive:
                        for name in archive.namelist():
                            check_bytes(archive.read(name))
    print("Artifact privacy audit passed; no raw trace resources or configured secret values found.")


if __name__ == "__main__":
    audit()
