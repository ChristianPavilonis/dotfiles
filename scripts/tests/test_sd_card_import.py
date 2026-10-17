import importlib.machinery
import importlib.util
from pathlib import Path
import tempfile
import sys
import threading
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "omarchy/.local/bin/sd-card-import"
loader = importlib.machinery.SourceFileLoader("sd_import", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
importer = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
loader.exec_module(importer)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.card = self.root / "card"
        self.card.mkdir()
        self.target = importer.destination(self.root / "Imports", "trip")
        self.stop = threading.Event()

    def source(self, name, content=b"camera original"):
        path = self.card / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_sony_layout_excludes_thumbnails_metadata_and_other_formats(self):
        wanted = ["DCIM/100MSDCF/DSC0001.ARW", "DCIM/100MSDCF/DSC0001.JPG",
                  "PRIVATE/M4ROOT/CLIP/C0001.MP4", "DCIM/100MSDCF/DSC0002.jpeg"]
        ignored = ["PRIVATE/M4ROOT/THMBNL/C0001.JPG", "PRIVATE/M4ROOT/CLIP/C0001.XML",
                   "PRIVATE/M4ROOT/SUB/C0001.MP4", "DCIM/100MSDCF/DSC0001.PNG",
                   "DCIM/100MSDCF/DSC0001.MOV", "AVF_INFO/DB.BIN", "random.JPG"]
        for name in wanted + ignored:
            self.source(name)
        self.assertEqual(set(importer.media_files(self.card)), {self.card / p for p in wanted})

    def test_case_insensitive_paths_and_extensions(self):
        source = self.source("private/m4root/clip/clip.Mp4")
        self.assertEqual(importer.media_files(self.card), [source])

    def test_symlinks_are_not_scanned(self):
        source = self.source("DCIM/real.JPG")
        (self.card / "DCIM/link.JPG").symlink_to(source)
        (self.card / "DCIM/loop").symlink_to(self.card, target_is_directory=True)
        self.assertEqual(importer.media_files(self.card), [source])

    def test_name_validation(self):
        for name in ["", " ", ".", "..", "../escape", "/tmp/escape", "a/b", "a\\b", ".hidden", "bad\nname"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                importer.folder_name(name)
        self.assertEqual(importer.folder_name(" weekend trip "), "weekend trip")

    def test_destination_symlink_rejected(self):
        (self.root / "Imports/link").symlink_to(self.card, target_is_directory=True)
        with self.assertRaises(ValueError):
            importer.destination(self.root / "Imports", "link")

    def test_copy_verified_original_unchanged_and_repeat_skipped(self):
        source = self.source("DCIM/PHOTO.ARW")
        before = source.stat()
        self.assertTrue(importer.copy_verified(source, self.target, self.stop))
        self.assertEqual((self.target / source.name).read_bytes(), source.read_bytes())
        self.assertEqual(source.stat().st_mtime_ns, before.st_mtime_ns)
        self.assertFalse(importer.copy_verified(source, self.target, self.stop))
        self.assertEqual(len(list(self.target.iterdir())), 1)

    def test_same_name_different_content_is_preserved_and_retry_skipped(self):
        first = self.source("DCIM/one/PHOTO.JPG", b"first")
        second = self.source("DCIM/two/PHOTO.JPG", b"second")
        for source in [first, second]:
            self.assertTrue(importer.copy_verified(source, self.target, self.stop))
        self.assertFalse(importer.copy_verified(second, self.target, self.stop))
        self.assertEqual((self.target / "PHOTO.JPG").read_bytes(), b"first")
        self.assertEqual((self.target / "PHOTO-1.JPG").read_bytes(), b"second")

    def test_existing_symlink_not_followed_or_overwritten(self):
        source = self.source("DCIM/PHOTO.JPG")
        (self.target / source.name).symlink_to(source)
        self.assertTrue(importer.copy_verified(source, self.target, self.stop))
        self.assertTrue((self.target / source.name).is_symlink())
        self.assertEqual((self.target / "PHOTO-1.JPG").read_bytes(), source.read_bytes())

    def test_failed_verification_leaves_no_published_or_temporary_file(self):
        source = self.source("DCIM/PHOTO.JPG")
        with patch.object(importer, "digest", side_effect=[b"original", b"corrupted"]):
            with self.assertRaisesRegex(OSError, "Verification failed"):
                importer.copy_verified(source, self.target, self.stop)
        self.assertEqual(list(self.target.iterdir()), [])
        self.assertEqual(source.read_bytes(), b"camera original")
        self.assertTrue(importer.copy_verified(source, self.target, self.stop))

    def test_interruption_during_copy_cleans_up_and_can_retry(self):
        source = self.source("DCIM/PHOTO.JPG")
        real_digest = importer.digest
        def interrupt(path, stop):
            result = real_digest(path, stop)
            stop.set()
            return result
        with patch.object(importer, "digest", side_effect=interrupt):
            with self.assertRaises(InterruptedError):
                importer.copy_verified(source, self.target, self.stop)
        self.assertEqual(list(self.target.iterdir()), [])
        self.stop.clear()
        self.assertTrue(importer.copy_verified(source, self.target, self.stop))

    def test_concurrent_destination_creation_never_overwrites(self):
        source = self.source("DCIM/PHOTO.JPG")
        def raced_link(temporary, candidate):
            candidate.write_bytes(b"other writer")
            raise FileExistsError(candidate)
        with patch.object(importer.os, "link", side_effect=raced_link):
            with self.assertRaises(FileExistsError):
                importer.copy_verified(source, self.target, self.stop)
        self.assertEqual((self.target / source.name).read_bytes(), b"other writer")
        self.assertEqual(len(list(self.target.iterdir())), 1)

    def test_non_mount_events_do_nothing(self):
        with patch("sys.argv", [str(SCRIPT), "device_added", "True", str(self.card)]), \
                patch.object(importer, "show_import") as show:
            importer.main()
            show.assert_not_called()


if __name__ == "__main__":
    unittest.main()
