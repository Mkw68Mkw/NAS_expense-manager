"""Run migrations and seeding once before Gunicorn starts its workers."""

from . import create_app

if __name__ == "__main__":
    create_app()
    print("Database ready.")
