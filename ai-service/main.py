"""
Compatibility entry point for local tools that prefer importing `main:app`.

Why keep this file?
- It makes the service friendlier to multiple startup conventions.
- It points learners to the real application package in `app/`.
- It mirrors how production services often retain thin wrappers around cleaner internal package structures.
"""

from app.main import app
