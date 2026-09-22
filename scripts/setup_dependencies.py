"""Install dependencies on Linux storage, avoiding npm extraction on WSL mounts."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import time


def main():
    root = Path(__file__).resolve().parent.parent
    cache_root = Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache'))
    project_id = hashlib.sha256(str(root).encode()).hexdigest()[:12]
    cache = cache_root / 'thors-running-club' / project_id
    cache.mkdir(parents=True, exist_ok=True)
    # Every setup uses a fresh directory, so a failed install leaves the previous
    # working node_modules link intact.
    install = Path(tempfile.mkdtemp(prefix='dependencies-', dir=cache))
    for name in ('package.json', 'package-lock.json'):
        (install / name).write_bytes((root / name).read_bytes())
    print(f'Installing dependencies in {install}', flush=True)
    subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=install, check=True)
    vite = install / 'node_modules' / 'vite' / 'bin' / 'vite.js'
    subprocess.run(['node', str(vite), '--version'], cwd=root, check=True)
    modules = root / 'node_modules'
    if modules.is_symlink():
        modules.unlink()
    elif modules.exists():
        backup = root / f'.node_modules-backup-{time.time_ns()}'
        modules.rename(backup)
        print(f'Previous dependencies preserved at {backup}', flush=True)
    modules.symlink_to(install / 'node_modules', target_is_directory=True)
    print('Dependencies ready. Run npm run dev.', flush=True)


if __name__ == '__main__':
    main()
