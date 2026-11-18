"""Serve the Suno webhook/API locally without consuming Telegram updates."""
from local_env import load_local_env

load_local_env()

from wsgiref.simple_server import make_server
from app import app

if __name__ == "__main__":
    print("Suno Jaucian API: http://127.0.0.1:3101")
    with make_server("127.0.0.1", 3101, app) as server:
        server.serve_forever()
