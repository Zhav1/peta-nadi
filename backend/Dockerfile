FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    PYTHONPATH=/app

WORKDIR /app

# Copy requirements dari folder backend dan instal dependensinya
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Salin isi dari folder backend ke /app
COPY backend/ .

# Salin folder agents dari root ke /app/agents
COPY agents/ ./agents/

# Expose the API port
EXPOSE 8000

# Start FastAPI application using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]