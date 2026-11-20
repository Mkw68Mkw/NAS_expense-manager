import os

bind = "0.0.0.0:5000"
# SQLite serialises writes; a couple of workers with threads is plenty for a single user.
workers = int(os.environ.get("GUNICORN_WORKERS", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))
timeout = 60
accesslog = "-"
errorlog = "-"
