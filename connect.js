var mongoose = require("mongoose");


// Read credentials from JSON
require('fs').readFile('env.json', 'utf-8', function(err, data) {

    if (err) throw err;
    
    var conf = JSON.parse(data);
    
    // Mongo client from JSON
    var mongo_addr = "mongodb://" + conf.mongodb.username + ":" + conf.mongodb.password + "@" + conf.mongodb.host + ":" + conf.mongodb.port + "/" + conf.mongodb.database

    console.log(mongo_addr);

    mongoose.Promise = global.Promise;

    /*调试模式是mongoose提供的一个非常实用的功能，用于查看mongoose模块对mongodb操作的日志，一般开发时会打开此功能，以便更好的了解和优化对mongodb的操作。*/
    mongoose.set('debug', true);

    /*一般默认没有user和password*/
    var db = mongoose.connect(mongo_addr);

    db.connection.on("error", function(error) {
        console.log("connet to mongodb failed：" + error);
    });

    db.connection.on("open", function() {
        console.log("connect to mongodb successfully.");
    });

})

module.exports =  mongoose;

