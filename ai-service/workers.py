"""
This file is intentionally a teaching placeholder.

Why keep an unused worker module in a learning project?
- Many real AI systems eventually move long-running jobs into async workers.
- This file shows where queue-based processing could live later.
- It teaches that synchronous HTTP APIs and asynchronous job workers are different scaling patterns.

Possible future upgrades:
- Celery or RQ worker
- background document ingestion
- batched embedding generation
- evaluation pipelines
"""

if __name__ == "__main__":
    print(
        "No background worker is configured in this version of the project. "
        "The file is kept to explain where asynchronous AI tasks could live later."
    )
