import os, signal, sys
ports = {int(p) for p in sys.argv[1:]}
def listeners():
    hexports = {f"{p:04X}" for p in ports}
    inodes = set()
    for f in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            for line in open(f).read().splitlines()[1:]:
                parts = line.split()
                if parts[3] == "0A" and parts[1].rsplit(":", 1)[1] in hexports:
                    inodes.add(parts[9])
        except FileNotFoundError:
            pass
    pids = set()
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            for fd in os.listdir(f"/proc/{pid}/fd"):
                try:
                    link = os.readlink(f"/proc/{pid}/fd/{fd}")
                except OSError:
                    continue
                if link.startswith("socket:[") and link[8:-1] in inodes:
                    pids.add(int(pid))
        except OSError:
            continue
    return pids
for pid in listeners():
    if pid != os.getpid():
        try:
            os.kill(pid, signal.SIGTERM); print("killed", pid)
        except ProcessLookupError:
            pass
