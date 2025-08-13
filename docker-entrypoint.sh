#!/bin/sh
mongod --fork --logpath /var/log/mongodb/mongod.log #/dev/null
mongosh "mongodb://localhost:27017/test?maxIdleTimeMS=360000" benchmark.js
tail -f /var/log/mongodb/mongod.log
