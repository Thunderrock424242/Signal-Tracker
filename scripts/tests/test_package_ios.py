"""Portable archive tests. Fixtures here are not compiled iPhone applications."""
import importlib.util
import plistlib
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "package-ios.py"


class IPhoneArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.app = self.root / "SignalTracker.app"
        self.app.mkdir()
        self.info = {"CFBundlePackageType": "APPL", "CFBundleExecutable": "SignalTracker",
                     "CFBundleSupportedPlatforms": ["iPhoneOS"]}
        self.write_info()
        (self.app / "SignalTracker").write_bytes(b"archive-test-fixture-not-a-real-executable")
        (self.app / "SignalTracker").chmod(0o755)
        (self.app / "Resources").mkdir()
        (self.app / "Resources" / "sample.json").write_text('{"provenance":"simulated"}', encoding="utf-8")

    def write_info(self):
        (self.app / "Info.plist").write_bytes(plistlib.dumps(self.info))

    def module(self):
        self.assertTrue(MODULE_PATH.is_file(), "The iPhone archive packager has not been implemented")
        spec = importlib.util.spec_from_file_location("package_ios", MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_archive_preserves_app_contents_and_iphone_payload_layout(self):
        output = self.root / "output" / "SignalTracker-unsigned.ipa"
        self.module().package_app(self.app, output)
        with zipfile.ZipFile(output) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read("Payload/SignalTracker.app/SignalTracker"),
                             b"archive-test-fixture-not-a-real-executable")
            self.assertEqual(archive.read("Payload/SignalTracker.app/Resources/sample.json"),
                             b'{"provenance":"simulated"}')
            self.assertFalse(any("\\" in path for path in archive.namelist()))
            self.assertTrue(archive.getinfo("Payload/SignalTracker.app/SignalTracker").external_attr >> 16 & 0o111)

    def test_simulator_app_cannot_be_packaged_for_sideloading(self):
        self.info["CFBundleSupportedPlatforms"] = ["iPhoneSimulator"]
        self.write_info()
        with self.assertRaisesRegex(ValueError, "iPhoneOS"):
            self.module().package_app(self.app, self.root / "bad.ipa")
        self.assertFalse((self.root / "bad.ipa").exists())

    def test_missing_executable_cannot_replace_an_existing_archive(self):
        (self.app / "SignalTracker").unlink()
        output = self.root / "existing.ipa"
        output.write_bytes(b"previous archive")
        with self.assertRaisesRegex(ValueError, "executable"):
            self.module().package_app(self.app, output)
        self.assertEqual(output.read_bytes(), b"previous archive")


if __name__ == "__main__":
    unittest.main()
