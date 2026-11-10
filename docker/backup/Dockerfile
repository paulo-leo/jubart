ARG MARIADB_VERSION=11.4@sha256:d1891ede5a559f1086f55053bb8cc1569b0298338c4d72d71725a7f74f6ba620
FROM mariadb:${MARIADB_VERSION}
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-croniter rclone tzdata ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY backup.py /opt/backup/backup.py
ENTRYPOINT ["python3", "/opt/backup/backup.py"]
CMD ["schedule"]
