#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 AURA 更新包发布到群晖 NAS 的 /volume1/web/aura（Web Station 静态站）。

用法：
    python3 tools/publish_update.py dist/AURA-v1.1.0-win64.zip --version 1.1.0 --notes "说明"

发布后更新地址：http://192.168.1.6/aura/update.json
AURA 托盘「检查更新」读它，下载 zip、校验 SHA-256、替换并重启。

走 SSH（cat 重定向），不依赖 DSM FileStation 上传接口（该接口在本机环境会挂起）。
上传顺序：先 zip，最后 update.json —— 避免清单指向尚未上传的包。
仅用标准库 + 系统 sshpass。
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

NAS = os.environ.get("NAS_HOST", "192.168.1.6")
NAS_USER = os.environ.get("NAS_USER", "bei")
NAS_PASS = os.environ.get("NAS_PASS", "Hzy1998.")
REMOTE_DIR = os.environ.get("NAS_DIR", "/volume1/web/aura")
PUBLIC_BASE = os.environ.get("PUBLIC_BASE", "http://192.168.1.6/aura")
SSHPASS = os.environ.get("SSHPASS_BIN", "/opt/data/.local/bin/sshpass")


def ssh(cmd, stdin_file=None):
    argv = [SSHPASS, "-p", NAS_PASS, "ssh", "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=15", f"{NAS_USER}@{NAS}", cmd]
    if stdin_file:
        with open(stdin_file, "rb") as f:
            subprocess.run(argv, stdin=f, check=True)
    else:
        subprocess.run(argv, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip", help="构建产物 zip 路径")
    ap.add_argument("--version", required=True)
    ap.add_argument("--notes", default="")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.isfile(args.zip):
        raise SystemExit("找不到压缩包：" + args.zip)

    name = os.path.basename(args.zip)
    with open(args.zip, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()

    manifest = {
        "version": args.version,
        "url": name,
        "sha256": digest,
        "size": os.path.getsize(args.zip),
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "notes": args.notes,
    }
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if args.dry_run:
        return

    tmp = os.path.join(os.path.dirname(os.path.abspath(args.zip)), "update.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    ssh(f"mkdir -p {REMOTE_DIR}")
    ssh(f"cat > {REMOTE_DIR}/{name}", args.zip)
    print("  已上传", name)
    ssh(f"cat > {REMOTE_DIR}/update.json", tmp)
    print("  已上传 update.json")
    print("完成：", PUBLIC_BASE + "/update.json")


if __name__ == "__main__":
    main()
