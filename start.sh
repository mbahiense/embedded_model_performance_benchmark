docker container stop mongodb
docker container rm mongodb
docker stop mongodb
docker rmi database_benchmark:1.0 -f
docker build -t  database_benchmark:1.0 .
docker run --publish="27017:27017" --name=mongodb --platform=linux/amd64 -d -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=$(echo 'toor') --memory="18g" --mount source=mongodb,target=/data/db database_benchmark:1.0
docker logs -f mongodb