from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def load_start_project_module():
    root = Path(__file__).resolve().parents[2]
    spec = spec_from_file_location("start_project", root / "start-project.py")
    assert spec is not None
    assert spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_rotate_log_files_moves_large_log_and_recreates_empty_file(tmp_path):
    module = load_start_project_module()
    log_file = tmp_path / "backend.log"
    log_file.write_text("x" * 64, encoding="utf-8")

    module.rotate_log_files(tmp_path, max_bytes=32, backups=2)

    assert log_file.exists()
    assert log_file.read_text(encoding="utf-8") == ""
    assert (tmp_path / "backend.log.1").read_text(encoding="utf-8") == "x" * 64

