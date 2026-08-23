FROM python:3.12-slim

RUN pip install --no-cache-dir conan-server

COPY conan-server.conf /var/lib/conan-server/server.conf

EXPOSE 9300

CMD ["conan_server", "--server_dir", "/var/lib/conan-server"]
