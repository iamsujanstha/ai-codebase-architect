# Python slim is a good balance between a small image and a familiar runtime.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy dependency definitions first so Docker can cache installed packages.
COPY requirements.txt ./

# Install the minimal runtime dependencies for the AI service.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source after dependencies.
COPY . .

EXPOSE 8000

# Uvicorn runs the FastAPI ASGI application.
# In a larger production deployment you might place Gunicorn in front of Uvicorn workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
