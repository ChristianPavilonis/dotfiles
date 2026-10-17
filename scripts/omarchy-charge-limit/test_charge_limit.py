import importlib.machinery
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader("charge_limit", str(Path(__file__).with_name("charge-limit")))
spec = importlib.util.spec_from_loader(loader.name, loader)
helper = importlib.util.module_from_spec(spec)
loader.exec_module(helper)


class ChargeLimitTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.state = patch.object(helper, "STATE_DIR", Path(self.directory.name))
        self.state.start()
        self.addCleanup(self.state.stop)
        self.actual = 100
        self.calls = []
        self.tool = patch.object(helper, "run_tool", self.run_tool)
        self.tool.start()
        self.addCleanup(self.tool.stop)

    def run_tool(self, *args):
        self.calls.append(args)
        if args:
            self.actual = int(args[0])
            return ""
        return f"Minimum 0%, Maximum {self.actual}%\n"

    def test_restricted_commands(self):
        for args in ([], ["set"], ["set", "0"], ["set", "101"], ["set", "80;id"],
                     ["set", "080"], ["set", "80", "--force"], ["--flash-ec", "/tmp/file"]):
            with self.subTest(args=args), self.assertRaises(ValueError):
                helper.parse_command(args)
        for preset in (60, 80, 100):
            self.assertEqual(helper.parse_command(["set", str(preset)]), ("set", preset))
        self.assertEqual(helper.parse_command(["restore"]), ("restore", None))

    def test_set_persists_and_restore_converges(self):
        for preset in (60, 80, 100, 80):
            self.assertEqual(helper.execute("set", preset), {"actual": preset, "saved": preset})
            self.assertEqual((helper.STATE_DIR / "limit").read_text(), f"{preset}\n")
            self.assertEqual((helper.STATE_DIR / "limit").stat().st_mode & 0o777, 0o644)
            self.actual = 100
            for _ in range(2):
                self.assertEqual(helper.execute("restore", None), {"actual": preset, "saved": preset})

    def test_status_does_not_write_or_change_hardware(self):
        self.assertEqual(helper.execute("status", None), {"actual": 100, "saved": None})
        self.assertEqual(self.calls, [()])
        self.assertFalse((helper.STATE_DIR / "limit").exists())

    def test_bad_state_does_not_reach_hardware(self):
        (helper.STATE_DIR / "limit").write_text("--flash-full-ec\n")
        with self.assertRaises(ValueError):
            helper.execute("restore", None)
        self.assertEqual(self.calls, [])

    def test_failed_apply_does_not_replace_saved_limit(self):
        helper.save_limit(60)
        for failure in (RuntimeError("EC failed"), subprocess.TimeoutExpired("framework_tool", 10)):
            with patch.object(helper, "run_tool", side_effect=failure), self.assertRaises(type(failure)):
                helper.execute("set", 80)
            self.assertEqual(helper.saved_limit(), 60)
        with patch.object(helper, "run_tool", return_value="Minimum 0%, Maximum 100%\n"):
            with self.assertRaises(RuntimeError):
                helper.execute("set", 80)
        self.assertEqual(helper.saved_limit(), 60)

    def test_unrecognized_or_out_of_range_output_is_not_success(self):
        for output in ("", "Maximum 80%", "Minimum 0%, Maximum 255%\n", "EC error"):
            with patch.object(helper, "run_tool", return_value=output), self.assertRaises(RuntimeError):
                helper.execute("set", 80)
            self.assertIsNone(helper.saved_limit())

    def test_fixed_tool_arguments_and_environment(self):
        # Use the actual subprocess adapter, not the fake EC.
        self.tool.stop()
        result = subprocess.CompletedProcess([], 0, "Minimum 0%, Maximum 80%\n", "")
        with patch.object(helper.subprocess, "run", return_value=result) as run:
            self.assertEqual(helper.actual_limit(), 80)
            self.assertEqual(run.call_args.args[0], ["/usr/bin/framework_tool", "--charge-limit"])
            self.assertEqual(run.call_args.kwargs["env"], {"PATH": "/usr/bin", "LANG": "C", "LC_ALL": "C"})
            helper.run_tool("80")
            self.assertEqual(run.call_args.args[0], ["/usr/bin/framework_tool", "--charge-limit", "80"])


if __name__ == "__main__":
    unittest.main()
