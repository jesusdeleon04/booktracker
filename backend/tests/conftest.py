"""Run every test against a throwaway data directory (DB cache, uploads)."""
import os
import tempfile

os.environ["BOOKTRACKER_DATA_DIR"] = tempfile.mkdtemp(prefix="booktracker-tests-")
# A developer's backend/.env may switch on multi-user mode; tests always start in local mode.
os.environ["BOOKTRACKER_AUTH"] = ""
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(os.environ["BOOKTRACKER_DATA_DIR"], "tests.db")  # never a real database
