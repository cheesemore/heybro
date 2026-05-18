#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 heybro 桶设置匿名可读（s3:GetObject），解决浏览器打开游戏时的 AccessDenied。

用法（项目根目录）:
  python scripts/配置内网桶公开读.py

依赖: pip install boto3
凭证: scripts/credentials.json（与一键打包相同）
"""

from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path


def main() -> int:
    script = Path(__file__).resolve().parent / "一键打包.py"
    mod = runpy.run_path(str(script))
    load_s3_upload_config = mod["load_s3_upload_config"]
    make_s3_client = mod["make_s3_client"]

    cfg = load_s3_upload_config()
    if cfg is None:
        print("未找到 scripts/credentials.json", file=sys.stderr)
        return 1

    from botocore.exceptions import ClientError

    client = make_s3_client(cfg)
    print(f"端点: {cfg.endpoint}")
    print(f"桶:   {cfg.bucket}")

    try:
        client.delete_public_access_block(Bucket=cfg.bucket)
        print("已尝试关闭 PublicAccessBlock（若服务支持）。")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code not in ("NoSuchPublicAccessBlockConfiguration", "NotImplemented", "AccessDenied"):
            print(f"PublicAccessBlock: {code} — {e}", file=sys.stderr)

    # RustFS 旧版不接受 Principal:"*"，须用 {"AWS":["*"]}；Action/Resource 也须为数组
    policy_variants = [
        (
            "Principal.AWS[*]",
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "HeyBroPublicRead",
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{cfg.bucket}/*"],
                    }
                ],
            },
        ),
        (
            'Principal "*"',
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "HeyBroPublicRead",
                        "Effect": "Allow",
                        "Principal": "*",
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{cfg.bucket}/*"],
                    }
                ],
            },
        ),
    ]

    last_err: ClientError | None = None
    for label, doc in policy_variants:
        try:
            client.put_bucket_policy(Bucket=cfg.bucket, Policy=json.dumps(doc))
            print(f"已写入桶策略（{label}）：允许匿名 GetObject。")
            last_err = None
            break
        except ClientError as e:
            last_err = e
            code = e.response.get("Error", {}).get("Code", "")
            print(f"  策略 {label} 失败: {code}")

    if last_err is not None:
        e = last_err
        print(f"写入桶策略失败: {e}", file=sys.stderr)
        print(
            "\n可在 RustFS 控制台手动添加策略，或使用 MinIO Client：\n"
            f"  mc alias set heybro {cfg.endpoint} <accessKey> <secretKey>\n"
            f"  mc anonymous set download heybro/{cfg.bucket}\n",
            file=sys.stderr,
        )
        return 1

    print(f"\n请在浏览器验证: {cfg.public_base_url}index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
