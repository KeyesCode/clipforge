FROM python:3.10-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# If service exposes an HTTP port, EXPOSE it (optional):
# EXPOSE 8001
# Adjust entrypoint/port to your service:
CMD ["python", "main.py"]
