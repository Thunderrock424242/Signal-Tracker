"""Package an already-built device app. This does not compile or sign Swift code."""
import argparse
import os
import plistlib
import stat
import tempfile
import zipfile
from pathlib import Path


def package_app(app: Path, output: Path) -> None:
    app, output = Path(app).resolve(), Path(output).resolve()
    if app.suffix != ".app" or not app.is_dir():
        raise ValueError("A built .app directory is required")
    if output.is_relative_to(app):
        raise ValueError("The archive output must be outside the app bundle")
    with (app / "Info.plist").open("rb") as source:
        info = plistlib.load(source)
    if info.get("CFBundlePackageType") != "APPL" or "iPhoneOS" not in info.get("CFBundleSupportedPlatforms", []):
        raise ValueError("Use an iPhoneOS device build, not an iOS Simulator app")
    executable = info.get("CFBundleExecutable")
    if not isinstance(executable, str) or not executable or Path(executable).name != executable or not (app / executable).is_file():
        raise ValueError("The app executable is missing or invalid")

    paths = [app] + sorted(app.rglob("*"), key=lambda path: path.as_posix())
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".ipa.tmp", delete=False) as temporary:
        pending = Path(temporary.name)
    try:
        with zipfile.ZipFile(pending, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in paths:
                name = "Payload/" + path.relative_to(app.parent).as_posix()
                mode = path.lstat().st_mode
                if path.is_symlink():
                    if not path.resolve().is_relative_to(app):
                        raise ValueError("App symlink points outside its bundle")
                    content = os.readlink(path).encode("utf-8")
                elif path.is_dir():
                    name += "/"
                    content = b""
                    mode = stat.S_IFDIR | 0o755
                else:
                    content = path.read_bytes()
                    if path == app / executable:
                        mode |= 0o111
                entry = zipfile.ZipInfo(name)
                entry.create_system = 3  # Unix attributes, including executable/symlink modes.
                entry.external_attr = mode << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(entry, content)
        os.replace(pending, output)
    finally:
        pending.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    package_app(args.app, args.output)
    print(f"Packaged device app: {args.output}")
