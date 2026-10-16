import json
import tempfile
import unittest
from pathlib import Path
from zipfile import BadZipFile, ZipFile
from sanitize_nexus_trace import sanitize


class TracePrivacyTests(unittest.TestCase):
    def test_removes_network_dom_parameters_results_errors_and_dynamic_titles(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "private-raw-trace.zip"
            clean = Path(folder) / "private-trace.zip"
            secret = "SYNTHETIC_PRIVATE_VALUE"
            with ZipFile(source, "w") as raw:
                raw.writestr("trace.trace", "\n".join(json.dumps(event) for event in [
                    {"type": "before", "callId": "1", "apiName": "locator.fill", "params": {"value": secret}, "title": secret},
                    {"type": "after", "callId": "1", "result": secret, "error": secret},
                    {"type": "console", "text": secret},
                    {"type": "frame-snapshot", "snapshot": secret},
                ]))
                raw.writestr("trace.network", secret)
                raw.writestr("resources/payload.json", secret)
            sanitize(source, clean)
            self.assertFalse(source.exists())
            with ZipFile(clean) as archive:
                self.assertEqual(archive.namelist(), ["trace.trace"])
                self.assertNotIn(secret.encode(), archive.read("trace.trace"))
                events = [json.loads(line) for line in archive.read("trace.trace").splitlines()]
                self.assertEqual([event["type"] for event in events], ["before", "after"])
                self.assertEqual(events[0]["apiName"], "locator.fill")

    def test_malformed_trace_does_not_leave_raw_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "private-raw-trace.zip"
            source.write_bytes(b"invalid archive")
            with self.assertRaises(BadZipFile):
                sanitize(source, Path(folder) / "private-trace.zip")
            self.assertFalse(source.exists())


if __name__ == "__main__":
    unittest.main()
