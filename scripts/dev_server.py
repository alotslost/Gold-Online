#!/usr/bin/env python3
"""开发服务器：在 python http.server 基础上为所有响应加 no-cache 头。

用途：本地开发时浏览器始终拿到最新文件，避免启发式缓存导致「改了代码页面不生效」。
启动：python3 scripts/dev_server.py   （默认端口 8000，可用第一个参数覆盖）
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ThreadingTCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
        print(f"黄金在线 dev server: http://localhost:{PORT} (Cache-Control: no-cache)")
        httpd.serve_forever()
