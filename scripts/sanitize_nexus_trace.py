"""Keep action diagnostics without console, network, DOM, or provisioning payloads."""
import json
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED


def sanitize(source: Path, destination: Path) -> None:
    if source.parent.resolve() != destination.parent.resolve() or source.name not in {"nexus-raw-trace.zip", "private-raw-trace.zip"}:
        raise ValueError("Unexpected trace paths")
    allowed = {
        "type", "callId", "parentId", "stepId", "startTime", "endTime", "wallTime",
        "monotonicTime", "method", "apiName", "class", "pageId", "browserName",
        "version", "origin", "platform", "sdkLanguage", "testIdAttributeName", "playwrightVersion",
    }
    try:
        with ZipFile(source) as raw, ZipFile(destination, "w", ZIP_DEFLATED) as clean:
            for name in raw.namelist():
                if not name.endswith(".trace"):
                    continue
                events = []
                for line in raw.read(name).decode("utf-8").splitlines():
                    event = json.loads(line)
                    if event.get("type") not in {"context-options", "before", "after"}:
                        continue
                    sanitized = {key: value for key, value in event.items() if key in allowed}
                    if event.get("type") == "context-options":
                        sanitized["options"] = {"viewport": {"width": 1280, "height": 720}}
                    events.append(json.dumps(sanitized))
                clean.writestr(name, "\n".join(events) + "\n")
    finally:
        # Never retain an unsanitized archive, even if processing fails.
        source.unlink(missing_ok=True)


if __name__ == "__main__":
    sanitize(Path(sys.argv[1]), Path(sys.argv[2]))
