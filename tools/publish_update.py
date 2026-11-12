#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 AURA 更新包发布到群晖 NAS 的 /web/aura 目录（Web Station 静态站）。

用法：
    python3 tools/publish_update.py dist/AURA-v1.1.0-win64.zip --version 1.1.0 --notes "新增监控台"

发布后更新地址为 http://<NAS>/aura/update.json，AURA 托盘「检查更新」会读它。
上传顺序：先 zip，最后 update.json —— 避免清单指向尚未上传的包。
仅用标准库，不需要安装 requests。
"""
import argparse
import datetime
import hashlib
import json
import mimetypes
import os
import secrets
import urllib.parse
import urllib.request

DSM = "http://192.168.1.6:5000/webapi/entry.cgi"
PUBLIC_BASE = "http://192.168.1.6/aura"
ACCOUNT = os.environ.get("NAS_USER", "bei")
PASSWORD = os.environ.get("NAS_PASS", "Hzy1998.")
REMOTE_DIR = "/web/aura"


def _get(params, timeout=20):
    url = DSM + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def login():
    j = _get({
        "api": "SYNO.API.Auth", "version": "6", "method": "login",
        "account": ACCOUNT, "passwd": PASSWORD, "session": "FileStation", "format": "cookie",
    })
    if not j.get("success"):
        raise SystemExit(f"NAS 登录失败：{j}")
    return j["data"]["sid"]


def upload(sid, local_path, remote_name, timeout=600):
    boundary = "----AURA" + secrets.token_hex(10)
    with open(local_path, "rb") as f:
        payload = f.read()

    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{remote_name}"\r\n'
        f"Content-Type: {mimetypes.guess_type(remote_name)[0] or 'application/octet-stream'}\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    body = head + payload + tail

    qs = urllib.parse.urlencode({
        "api": "SYNO.FileStation.Upload", "version": "2", "method": "upload",
        "path": REMOTE_DIR, "create_parents": "true", "overwrite": "true",
    })
    req = urllib.request.Request(
        DSM + "?" + qs, data=body, method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
            "Cookie": f"id={sid}",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        j = json.loads(r.read().decode("utf-8"))
    if not j.get("success"):
        raise SystemExit(f"上传 {remote_name} 失败：{j}")
    print(f"  已上传 {remote_name} ({len(payload)/1048576:.2f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip", help="构建产物 zip 路径")
    ap.add_argument("--version", required=True, help="版本号，例如 1.1.0")
    ap.add_argument("--notes", default="", help="更新说明")
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
        print("dry-run：未上传")
        return

    sid = login()
    upload(sid, args.zip, name)

    tmp = os.path.join(os.path.dirname(args.zip) or ".", "update.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    upload(sid, tmp, "update.json")

    print("完成：", PUBLIC_BASE + "/update.json")


if __name__ == "__main__":
    main()
