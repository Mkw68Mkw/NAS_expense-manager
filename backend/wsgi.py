from app import create_app

# The schema is migrated by `python -m app.init_db` before Gunicorn starts.
app = create_app({"AUTO_INIT_DB": False})
